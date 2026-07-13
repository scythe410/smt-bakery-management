-- Migration 008 — stock_movement ledger + recipe deduction on sale
--
-- Implements CLAUDE.md §4 "Inventory reconciliation":
--   * ONE append-only ledger (public.stock_movement) records every stock change;
--     inventory_item.qty_on_hand is the RUNNING TOTAL a trigger maintains in the
--     SAME transaction (movement insert ⇒ qty_on_hand += delta).
--   * A REALIZED order (status = 'completed', the existing REALIZED_STATUS rule in
--     lib/db/selectors/_shared.ts) deducts its ingredients: for each
--     order_item → menu_item → recipe_line, a negative `sale` movement of
--     -(recipe_qty × order_item.qty), aggregated per ingredient, in the SAME
--     transaction as the order (create_order calls the helper; a later
--     pending→completed transition posts it via an order trigger).
--   * When an order leaves the sold state (cancelled, or payment refunded), a
--     compensating positive `sale_reversal` is posted atomically.
--   * sale/sale_reversal are IDEMPOTENT per (ref_order_id, inventory_item_id,
--     reason) via a partial unique index + ON CONFLICT DO NOTHING, so a retry /
--     double-submit can't double-apply (neither the ledger row nor qty_on_hand,
--     since the qty trigger fires only for rows actually inserted).
--
-- Quantity only — NO money here (cost basis is cash; recipe COGS stays a
-- margin-only figure, never a second expense line). qty_on_hand is already
-- numeric(12,3) (migration 002), and recipe_line.qty / delta are numeric on the
-- item's stocking unit, so fractional kg/L usage needs no conversion layer and
-- no integer-column migration. recipe_line.unit is ENFORCED to equal the item's
-- stocking unit so the "deduct on the same basis as COGS" invariant can't drift.
--
-- Stock may go NEGATIVE: a sale is never blocked on insufficient stock (refusing
-- mid-service is worse; system stock lies — spillage, unlogged waste). The
-- low-stock view (migration 007) surfaces it.
--
-- Security (CLAUDE.md §7): stock_movement is RLS tenant-scoped; only SELECT +
-- INSERT policies exist ⇒ append-only (UPDATE/DELETE denied by default).
-- business_id is stamped from the session on insert (never client-settable). All
-- movement-posting functions are SECURITY INVOKER, so RLS stays in force and a
-- cross-tenant item/order is invisible ⇒ rejected.

-- ---------------------------------------------------------------------------
-- 1. Reason enum + the append-only ledger table.
-- ---------------------------------------------------------------------------
create type public.stock_movement_reason as enum
  ('sale', 'sale_reversal', 'restock', 'count_adjust', 'manual');

create table public.stock_movement (
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.business (id) on delete cascade,
  inventory_item_id uuid not null,
  -- Signed change in the item's base/stocking unit: sale < 0, restock > 0.
  delta             numeric(12, 3) not null,
  reason            public.stock_movement_reason not null,
  -- Provenance. ref_order_id ties sale/reversal to the order (drives idempotency
  -- + reversal). ref_stock_day_id is reserved for the future daily-count lane
  -- (merchandise); no stock_day table exists yet, so it carries no FK.
  ref_order_id      uuid,
  ref_stock_day_id  uuid,
  note              text,
  created_by        uuid references public.profile (id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (id, business_id),
  -- Composite FKs: a movement can never point at another tenant's item/order.
  foreign key (inventory_item_id, business_id)
    references public.inventory_item (id, business_id) on delete cascade,
  foreign key (ref_order_id, business_id)
    references public."order" (id, business_id) on delete set null (ref_order_id)
);

comment on table public.stock_movement is
  'Append-only stock ledger. inventory_item.qty_on_hand is the running total maintained by the stock_movement_apply trigger. sale/sale_reversal are idempotent per (ref_order_id, inventory_item_id, reason).';

create index stock_movement_business_id_idx on public.stock_movement (business_id);
create index stock_movement_item_idx        on public.stock_movement (inventory_item_id, business_id);
create index stock_movement_order_idx       on public.stock_movement (ref_order_id) where ref_order_id is not null;

-- Idempotency: at most one sale (and one reversal) per order+item. A retried
-- create_order / a re-run reversal collides here and is a no-op (ON CONFLICT DO
-- NOTHING). restock/count_adjust/manual are unconstrained (repeatable events).
create unique index stock_movement_sale_idempotent_uniq
  on public.stock_movement (ref_order_id, inventory_item_id, reason)
  where ref_order_id is not null and reason in ('sale', 'sale_reversal');

-- ---------------------------------------------------------------------------
-- 2. Running total: the same transaction that inserts a movement bumps
--    qty_on_hand by delta. SECURITY INVOKER ⇒ the update is RLS-checked as the
--    caller (all roles have inventory_item tenant access). Fires only for rows
--    ACTUALLY inserted, so ON CONFLICT DO NOTHING never double-applies.
-- ---------------------------------------------------------------------------
create or replace function private.apply_stock_movement()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.inventory_item
     set qty_on_hand = qty_on_hand + new.delta
   where id = new.inventory_item_id
     and business_id = new.business_id;
  return null;
end;
$$;

create trigger stock_movement_apply
  after insert on public.stock_movement
  for each row execute function private.apply_stock_movement();

-- Stamp business_id from the session on insert (client can never choose a
-- tenant); service-role / seed contexts keep the explicit value. Reused from
-- migration 002. No BEFORE UPDATE trigger: the table is append-only.
create trigger stock_movement_set_business_id
  before insert on public.stock_movement
  for each row execute function private.set_business_id_from_session();

-- ---------------------------------------------------------------------------
-- 3. RLS — tenant read + insert only (append-only by omission of UPDATE/DELETE).
-- ---------------------------------------------------------------------------
alter table public.stock_movement enable row level security;

create policy "stock_movement: tenant read" on public.stock_movement
  for select to authenticated
  using ( business_id = private.current_business_id() );

create policy "stock_movement: tenant insert" on public.stock_movement
  for insert to authenticated
  with check ( business_id = private.current_business_id() );

-- ---------------------------------------------------------------------------
-- 4. recipe_line.unit must equal the item's stocking unit — enforced so the
--    "deduct on the same basis as COGS" invariant can't drift. There is no
--    recipe editor UI yet, so this DB guard is the enforcement point; when one
--    is built it should surface each ingredient's unit and validate against it.
--    Look up by inventory_item.id alone (PK, unique) so it is independent of the
--    business_id-stamping trigger's firing order; RLS/the composite FK enforce
--    tenant match separately.
-- ---------------------------------------------------------------------------
create or replace function private.enforce_recipe_line_unit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_unit text;
begin
  select unit into v_unit
  from public.inventory_item
  where id = new.inventory_item_id;

  if v_unit is not null and new.unit is distinct from v_unit then
    raise exception
      'recipe_line unit (%) must match the ingredient''s stocking unit (%); stock in the base unit and never convert silently',
      new.unit, v_unit
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger recipe_line_enforce_unit
  before insert or update on public.recipe_line
  for each row execute function private.enforce_recipe_line_unit();

-- ---------------------------------------------------------------------------
-- 5. Deduct / reverse an order's ingredients. Both SECURITY INVOKER (RLS
--    enforced) and idempotent. Aggregate per ingredient so an ingredient shared
--    by several lines yields ONE movement per order (matches the unique index).
--    Deduction is recipe-driven and kind-agnostic — exactly the lines the COGS
--    view (recipe_cost_line) sums — so deduction and COGS stay consistent by
--    construction. (A merchandise item sold 1:1 as a line is modelled as a
--    single qty-1 recipe_line to its inventory row; the same loop deducts it.)
-- ---------------------------------------------------------------------------
create or replace function private.deduct_order_sale(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, ref_order_id, created_by)
  select
    oi.business_id,
    rl.inventory_item_id,
    -sum(rl.qty * oi.qty),          -- negative: stock leaves on a sale
    'sale',
    oi.order_id,
    (select auth.uid())
  from public.order_item oi
  join public.recipe_line rl
    on rl.menu_item_id = oi.menu_item_id
   and rl.business_id  = oi.business_id
  where oi.order_id = p_order_id
  group by oi.business_id, oi.order_id, rl.inventory_item_id
  on conflict (ref_order_id, inventory_item_id, reason)
    where ref_order_id is not null and reason in ('sale', 'sale_reversal')
  do nothing;
end;
$$;

-- Reverse by mirroring the order's existing `sale` movements (delta negated), so
-- the reversal returns EXACTLY what was deducted even if the recipe changed since.
create or replace function private.reverse_order_sale(p_order_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.stock_movement
    (business_id, inventory_item_id, delta, reason, ref_order_id, created_by)
  select
    sm.business_id,
    sm.inventory_item_id,
    -sm.delta,                      -- positive: stock returns on a reversal
    'sale_reversal',
    sm.ref_order_id,
    (select auth.uid())
  from public.stock_movement sm
  where sm.ref_order_id = p_order_id
    and sm.reason = 'sale'
  on conflict (ref_order_id, inventory_item_id, reason)
    where ref_order_id is not null and reason in ('sale', 'sale_reversal')
  do nothing;
end;
$$;

revoke all on function private.deduct_order_sale(uuid)  from public;
revoke all on function private.reverse_order_sale(uuid) from public;
grant execute on function private.deduct_order_sale(uuid)  to authenticated;
grant execute on function private.reverse_order_sale(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Order-lifecycle trigger: keep the ledger in step with an order's status.
--    "Sold" = realized revenue that consumed stock = status 'completed' AND not
--    refunded. On the flip INTO sold ⇒ deduct; on the flip OUT of sold (cancel
--    or refund) ⇒ reverse. Fires in the SAME transaction as the status change,
--    so a cancel/refund posts its compensating movements atomically. Idempotent
--    helpers make a re-run harmless.
-- ---------------------------------------------------------------------------
create or replace function private.sync_order_stock()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_was_sold boolean := (old.status = 'completed' and old.payment_status <> 'refunded');
  v_is_sold  boolean := (new.status = 'completed' and new.payment_status <> 'refunded');
begin
  if v_is_sold and not v_was_sold then
    perform private.deduct_order_sale(new.id);
  elsif v_was_sold and not v_is_sold then
    perform private.reverse_order_sale(new.id);
  end if;
  return null;
end;
$$;

create trigger order_sync_stock
  after update on public."order"
  for each row execute function private.sync_order_stock();

-- ---------------------------------------------------------------------------
-- 7. Extend create_order: deduct ingredients for an order minted REALIZED, in
--    the same transaction. New orders currently land 'pending', so this guard is
--    normally dormant — the pending→completed transition (trigger above) posts
--    the sale — but it keeps the invariant correct if create_order ever mints a
--    completed order. Everything above the deduction is unchanged from
--    migration 005.
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_source         public.order_source,
  p_customer_name  text,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items          jsonb
)
returns public."order"
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id     uuid;
  v_lines           jsonb;
  v_subtotal        bigint;
  v_resolved_count  int;
  v_requested_count int;
  v_rate            int;
  v_commission      bigint;
  v_seq             bigint;
  v_order           public."order";
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'create_order: no business for current user'
      using errcode = '42501';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'create_order: at least one item is required'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e->>'qty')::int is null or (e->>'qty')::int < 1
  ) then
    raise exception 'create_order: each item qty must be a positive integer'
      using errcode = '22023';
  end if;

  select
    coalesce(jsonb_agg(jsonb_build_object(
      'menu_item_id',     r.menu_item_id,
      'name',             m.name,
      'unit_price_cents', m.price_cents,
      'qty',              r.qty
    )), '[]'::jsonb),
    coalesce(sum(m.price_cents::bigint * r.qty), 0)
  into v_lines, v_subtotal
  from (
    select (e->>'menu_item_id')::uuid as menu_item_id,
           sum((e->>'qty')::int)      as qty
    from jsonb_array_elements(p_items) e
    group by 1
  ) r
  join public.menu_item m
    on m.id = r.menu_item_id
   and m.is_available = true;

  v_resolved_count := jsonb_array_length(v_lines);
  select count(distinct (e->>'menu_item_id'))
  into v_requested_count
  from jsonb_array_elements(p_items) e;

  if v_resolved_count <> v_requested_count then
    raise exception 'create_order: one or more items are invalid or unavailable'
      using errcode = '22023';
  end if;

  v_rate := private.commission_rate_bps(p_source);
  v_commission := round(coalesce(v_subtotal, 0)::numeric * v_rate / 10000.0);

  v_seq := private.next_order_seq();

  insert into public."order" (
    business_id, order_no, source, customer_name,
    subtotal_cents, commission_cents, total_cents,
    payment_method, payment_status, status
  ) values (
    v_business_id,
    'ORD-' || v_seq::text,
    p_source,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    v_subtotal,
    v_commission,
    v_subtotal,
    p_payment_method,
    p_payment_status,
    'pending'
  )
  returning * into v_order;

  insert into public.order_item (
    business_id, order_id, menu_item_id, name_snapshot, qty, unit_price_cents
  )
  select
    v_business_id,
    v_order.id,
    (l->>'menu_item_id')::uuid,
    l->>'name',
    (l->>'qty')::int,
    (l->>'unit_price_cents')::int
  from jsonb_array_elements(v_lines) l;

  -- Deduct ingredients only for a REALIZED order (see _shared.ts REALIZED_STATUS).
  if v_order.status = 'completed' and v_order.payment_status <> 'refunded' then
    perform private.deduct_order_sale(v_order.id);
  end if;

  return v_order;
end;
$$;

revoke all on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) from public;
grant execute on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) to authenticated;

comment on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) is 'Atomically mint an order + its items for the caller''s tenant. SECURITY INVOKER (RLS enforced); recomputes prices/commission server-side; allocates ORD-<order_seq> under a row lock; deducts ingredients via stock_movement when the order is realized. authenticated-only.';
