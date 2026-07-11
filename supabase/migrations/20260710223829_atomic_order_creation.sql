-- Migration 005 — atomic order creation via a transactional RPC
--
-- Replaces the multi-step, client-orchestrated order flow (read all order_nos →
-- pick max+1 in app code → insert order → insert items → compensating delete on
-- failure). That path had three defects, all closed here:
--   * HIGH-04  order_no race: two concurrent creates read the same max and mint
--              the SAME number (unique(business_id, order_no) then errors one).
--   * HIGH-05  >1000-row duplicate-number bug: numbering started at max=1000, so
--              a tenant whose numbers wrapped/started differently could collide;
--              app-side parsing of a text column is fragile past assumptions.
--   * MED-02   non-atomic order+items: the order and its items were two separate
--              round-trips with a best-effort delete if the second failed — a
--              crash between them left a total-bearing order with no lines.
--
-- The fix: a single SECURITY INVOKER function public.create_order(...) that does
-- everything in ONE transaction under the caller's own RLS. It recomputes prices
-- from menu_item (never trusts the client — CLAUDE.md §3/§7.7), computes
-- subtotal/commission/total server-side, allocates the number atomically, and
-- inserts the order + all items together (snapshotting name + unit_price_cents).
--
-- Numbering: a per-tenant monotonic counter business.order_seq. The number is
-- allocated with `UPDATE business SET order_seq = order_seq + 1 ... RETURNING`,
-- whose row lock serialises concurrent creates per tenant, so numbers are unique
-- and monotonic. They are GAP-TOLERANT by design: a rolled-back transaction
-- consumes a value that is never reused — the system relies on uniqueness +
-- order, never on contiguity.
--
-- Security posture (CLAUDE.md §7):
--   * create_order is SECURITY INVOKER ⇒ RLS stays in force: it can only ever
--     read/insert THIS tenant's rows. A cross-tenant menu_item id is invisible
--     under RLS, so it fails validation and the whole transaction rolls back.
--   * The ONE privileged step — bumping order_seq — is delegated to a private
--     SECURITY DEFINER helper that is self-scoping (only ever touches the
--     caller's own business row, id = current_business_id()). This mirrors the
--     existing current_business_id()/current_profile() helpers and avoids opening
--     a client-writable UPDATE policy on business (the settings migration made
--     business UPDATE owner-only; managers/staff must still create orders).
--   * EXECUTE on create_order is granted to `authenticated` only (revoked from
--     public/anon), so anon cannot reach it via the Data API.

-- ---------------------------------------------------------------------------
-- 1. Per-tenant monotonic order counter.
--    Default 1000 so the first allocation is ORD-1001 (matches the prior scheme
--    and the seed). Backfill lifts each existing tenant's counter above its
--    highest existing order number so new numbers never collide with history.
-- ---------------------------------------------------------------------------
alter table public.business
  add column if not exists order_seq bigint not null default 1000;

comment on column public.business.order_seq is
  'Monotonic per-tenant order counter. create_order() allocates ORD-<order_seq> atomically via UPDATE ... RETURNING under a row lock. Gap-tolerant; values are never reused.';

update public.business b
set order_seq = greatest(
  b.order_seq,
  coalesce((
    select max((regexp_replace(o.order_no, '[^0-9]', '', 'g'))::bigint)
    from public."order" o
    where o.business_id = b.id
      and o.order_no ~ '[0-9]'
  ), 0)
);

-- ---------------------------------------------------------------------------
-- 2. Private, self-scoping counter allocator (SECURITY DEFINER).
--    Bumps ONLY the caller's own business row and returns the new value. The
--    UPDATE takes a row lock, serialising concurrent create_order() calls for
--    the same tenant. Lives in the private schema (not exposed via the Data
--    API); EXECUTE granted to authenticated only.
-- ---------------------------------------------------------------------------
create or replace function private.next_order_seq()
returns bigint
language sql
security definer
set search_path = ''
as $$
  update public.business
     set order_seq = order_seq + 1
   where id = private.current_business_id()
  returning order_seq;
$$;

revoke all on function private.next_order_seq() from public;
grant execute on function private.next_order_seq() to authenticated;

-- Commission rate for the caller's tenant + a given source, in basis points.
-- SECURITY DEFINER + self-scoping so create_order computes commission correctly
-- regardless of the creator's ROLE: commission_rule's RLS is owner/manager-only,
-- but staff can create orders too, and an order's commission must not depend on
-- who rang it up (CLAUDE.md §3/§7.7). Only ever reads the caller's OWN tenant's
-- rule (id = current_business_id()), so definer rights leak nothing cross-tenant;
-- the rate is used internally and never returned to the client. Missing rule ⇒ 0.
create or replace function private.commission_rate_bps(p_source public.order_source)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select rate_bps
    from public.commission_rule
    where business_id = private.current_business_id()
      and source = p_source
  ), 0);
$$;

revoke all on function private.commission_rate_bps(public.order_source) from public;
grant execute on function private.commission_rate_bps(public.order_source) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. public.create_order — the atomic, RLS-enforced order mint.
--
-- Params: the order's chrome (source, optional walk-in name, payment
-- method/status) and p_items, a jsonb array of {menu_item_id, qty}. The client
-- sends only WHICH items and HOW MANY — every figure is recomputed here.
-- Returns the inserted order row.
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

  -- Commission recomputed from the rule for this source (0 for own channels).
  -- Read via a self-scoping helper so the figure is correct for ANY creator role
  -- (commission_rule is owner/manager-only under RLS, but staff create orders too).
  v_rate := private.commission_rate_bps(p_source);
  v_commission := round(coalesce(v_subtotal, 0)::numeric * v_rate / 10000.0);

  -- Allocate the number atomically (row lock serialises concurrent creates).
  v_seq := private.next_order_seq();

  -- Insert the order. total = subtotal (commission is the platform's cut,
  -- tracked separately, not added to the bill — matches the seed + selectors).
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
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) from public;
grant execute on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) to authenticated;

comment on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb
) is 'Atomically mint an order + its items for the caller''s tenant. SECURITY INVOKER (RLS enforced); recomputes prices/commission server-side; allocates ORD-<order_seq> under a row lock. authenticated-only.';
