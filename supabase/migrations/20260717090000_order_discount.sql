-- Migration 021 — whole-order percentage discount on orders
--
-- Adds quick cashier discounts (10% / 15% / 20%, or none) applied to the ORDER
-- SUBTOTAL. Like every other money figure, the discount is NEVER trusted from the
-- client (CLAUDE.md §3/§7.7): the client sends only WHICH percentage; the server
-- (public.create_order) recomputes discount_cents and the net total from the
-- stored line prices. Both discount_pct and the resulting discount_cents are
-- stored on the order so the figure is auditable and the bill can render it.
--
-- Money model (all integer minor units, LKR):
--   subtotal_cents = Σ(line qty × unit_price_cents)            -- GROSS, pre-discount
--   discount_cents = round(subtotal_cents × discount_pct/100)  -- the reduction
--   total_cents    = subtotal_cents − discount_cents           -- NET (what's paid)
--   commission     = round(total_cents × rate_bps/10000)       -- on the NET base
--
-- Commission moves onto the NET base (total_cents) rather than the gross subtotal:
-- a platform's cut is charged on what the customer actually pays. For a 0%
-- discount total_cents = subtotal_cents, so this is a no-op for every existing
-- row and the seed — nothing reconciles differently until a discount is applied.
-- It is REQUIRED for internal consistency: Finance "Platform Earnings" shows
-- Σ total_cents as the base commission is charged on, so the base used must equal
-- the base shown (selectors/_shared.ts, selectors/finance.ts).

-- ---------------------------------------------------------------------------
-- 1. Columns + integrity guards (defence in depth — the app path also validates).
-- ---------------------------------------------------------------------------
alter table public."order"
  add column if not exists discount_pct   smallint not null default 0,
  add column if not exists discount_cents integer  not null default 0;

comment on column public."order".discount_pct is
  'Whole-order percentage discount applied at sale (0/10/15/20). Auditable alongside discount_cents.';
comment on column public."order".discount_cents is
  'Resulting discount in integer cents = round(subtotal_cents × discount_pct/100). total_cents = subtotal_cents − discount_cents.';

alter table public."order"
  add constraint order_discount_pct_valid  check (discount_pct in (0, 10, 15, 20)),
  add constraint order_discount_nonneg      check (discount_cents >= 0),
  add constraint order_discount_le_subtotal check (discount_cents <= subtotal_cents),
  -- The net-total invariant, enforced at the DB so no write path can drift it.
  add constraint order_total_is_net         check (total_cents = subtotal_cents - discount_cents);

-- ---------------------------------------------------------------------------
-- 2. create_order — add p_discount_pct and recompute discount + net total.
--    Adding a parameter changes the function's identity (it would OVERLOAD, not
--    replace), so drop the old 5-arg signature first, then create the 6-arg one.
-- ---------------------------------------------------------------------------
drop function if exists public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
);

create or replace function public.create_order(
  p_source         public.order_source,
  p_customer_name  text,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items          jsonb,
  p_discount_pct   int default 0
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
  v_discount_pct    int;
  v_discount        bigint;
  v_total           bigint;
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

  -- Input shape guard (defence in depth; the server action also validates).
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

  -- Discount is one of the fixed quick-buttons (or none). Reject anything else.
  v_discount_pct := coalesce(p_discount_pct, 0);
  if v_discount_pct not in (0, 10, 15, 20) then
    raise exception 'create_order: discount percentage must be 0, 10, 15 or 20'
      using errcode = '22023';
  end if;

  -- Collapse duplicate lines, then resolve authoritative name/price from
  -- menu_item. The join is RLS-scoped (SECURITY INVOKER), so it matches ONLY
  -- this tenant's AVAILABLE items — a cross-tenant or unavailable id drops out.
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

  -- Every submitted id must resolve to one of this tenant's available items.
  if v_resolved_count <> v_requested_count then
    raise exception 'create_order: one or more items are invalid or unavailable'
      using errcode = '22023';
  end if;

  -- Discount applies to the subtotal; the net total is what the customer pays.
  v_discount := round(coalesce(v_subtotal, 0)::numeric * v_discount_pct / 100.0);
  v_total    := coalesce(v_subtotal, 0) - v_discount;

  -- Commission recomputed on the NET base (what the customer pays) from the rule
  -- for this source (0 for own channels). Read via a self-scoping helper so the
  -- figure is correct for ANY creator role (commission_rule is owner/manager-only
  -- under RLS, but staff create orders too).
  v_rate := private.commission_rate_bps(p_source);
  v_commission := round(v_total::numeric * v_rate / 10000.0);

  -- Allocate the number atomically (row lock serialises concurrent creates).
  v_seq := private.next_order_seq();

  insert into public."order" (
    business_id, order_no, source, customer_name,
    subtotal_cents, discount_pct, discount_cents, commission_cents, total_cents,
    payment_method, payment_status, status
  ) values (
    v_business_id,
    'ORD-' || v_seq::text,
    p_source,
    nullif(btrim(coalesce(p_customer_name, '')), ''),
    v_subtotal,
    v_discount_pct,
    v_discount,
    v_commission,
    v_total,
    p_payment_method,
    p_payment_status,
    'pending'
  )
  returning * into v_order;

  -- Insert all line items in one statement, snapshotting name + unit price.
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

  return v_order;
end;
$$;

-- authenticated only — never anon (no Data API access without a session).
revoke all on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) from public;
grant execute on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) to authenticated;

comment on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) is 'Atomically mint an order + its items for the caller''s tenant. SECURITY INVOKER (RLS enforced); recomputes prices, whole-order discount, net total and commission (on the net base) server-side; allocates ORD-<order_seq> under a row lock. authenticated-only.';
