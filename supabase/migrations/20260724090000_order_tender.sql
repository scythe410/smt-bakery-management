-- Migration 027 — cash tendered + change on an order
--
-- Client request: "add the balance and the amount the customer gives on the bill."
-- Records the CASH the customer hands over (tendered_cents) so the receipt can
-- print "Amount given" and the "Balance" (change) returned. Change is DERIVED at
-- render (tendered − total), never stored — one figure, one source.
--
-- tendered_cents is an INPUT the cashier records, not a computed money total, so
-- it is not "recomputed server-side" like subtotal/commission/total. It is still
-- validated (integer minor units, non-negative) and stored on the order; a NULL
-- means "not recorded" (a non-cash sale, or an order taken before this field
-- existed). It does not touch subtotal/discount/commission/total or the stock
-- ledger — change is purely presentational.
--
-- Threads a trailing p_tendered_cents through both order-writing RPCs. Adding a
-- parameter changes each function's identity (it would OVERLOAD, not replace), so
-- the old signature is dropped first, then the new one created — the same pattern
-- migration 021 used to add p_discount_pct.

-- ---------------------------------------------------------------------------
-- 1. Column + integrity guard (nullable; non-cash / historical orders have none).
-- ---------------------------------------------------------------------------
alter table public."order"
  add column if not exists tendered_cents integer;

comment on column public."order".tendered_cents is
  'Cash the customer handed over, integer minor units (LKR). NULL = not recorded (non-cash or pre-field). Change on the bill = tendered_cents − total_cents (derived, never stored).';

alter table public."order"
  add constraint order_tendered_nonneg check (tendered_cents is null or tendered_cents >= 0);

-- ---------------------------------------------------------------------------
-- 2. create_order — accept the tendered amount and store it on the new order.
-- ---------------------------------------------------------------------------
drop function if exists public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int
);

create or replace function public.create_order(
  p_source         public.order_source,
  p_customer_name  text,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items          jsonb,
  p_discount_pct   int default 0,
  p_tendered_cents int default null
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

  -- Tendered cash is a recorded input, not a computed total; only guard its sign.
  if p_tendered_cents is not null and p_tendered_cents < 0 then
    raise exception 'create_order: tendered amount cannot be negative'
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
    payment_method, payment_status, tendered_cents, status
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
    p_tendered_cents,
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

revoke all on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) from public;
grant execute on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) to authenticated;

comment on function public.create_order(
  public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) is 'Atomically mint an order + its items for the caller''s tenant. SECURITY INVOKER (RLS enforced); recomputes prices, whole-order discount, net total and commission (on the net base) server-side; records the tendered cash (change is derived on the bill); allocates ORD-<order_seq> under a row lock. authenticated-only.';

-- ---------------------------------------------------------------------------
-- 3. update_order — same trailing p_tendered_cents; store it on the edited order.
-- ---------------------------------------------------------------------------
drop function if exists public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int
);

create or replace function public.update_order(
  p_order_id       uuid,
  p_source         public.order_source,
  p_customer_name  text,
  p_payment_method public.payment_method,
  p_payment_status public.payment_status,
  p_items          jsonb,
  p_discount_pct   int default 0,
  p_tendered_cents int default null
)
returns public."order"
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_business_id     uuid;
  v_order           public."order";
  v_lines           jsonb;
  v_subtotal        bigint;
  v_resolved_count  int;
  v_requested_count int;
  v_discount_pct    int;
  v_discount        bigint;
  v_total           bigint;
  v_rate            int;
begin
  v_business_id := private.current_business_id();
  if v_business_id is null then
    raise exception 'update_order: no business for current user'
      using errcode = '42501';
  end if;

  -- Lock the order row for this transaction. RLS makes a cross-tenant id
  -- invisible ⇒ not found.
  select * into v_order
  from public."order"
  where id = p_order_id and business_id = v_business_id
  for update;

  if not found then
    raise exception 'update_order: no such order' using errcode = 'PG002';
  end if;

  if v_order.status <> 'pending' then
    raise exception 'update_order: only pending orders can be edited (order is %)',
      v_order.status
      using errcode = 'OR002';
  end if;

  -- Input shape guard (defence in depth; the server action also validates).
  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'update_order: at least one item is required'
      using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_items) e
    where (e->>'qty')::int is null or (e->>'qty')::int < 1
  ) then
    raise exception 'update_order: each item qty must be a positive integer'
      using errcode = '22023';
  end if;

  v_discount_pct := coalesce(p_discount_pct, 0);
  if v_discount_pct not in (0, 10, 15, 20) then
    raise exception 'update_order: discount percentage must be 0, 10, 15 or 20'
      using errcode = '22023';
  end if;

  if p_tendered_cents is not null and p_tendered_cents < 0 then
    raise exception 'update_order: tendered amount cannot be negative'
      using errcode = '22023';
  end if;

  -- Collapse duplicate lines, then resolve authoritative name/price from
  -- menu_item — identical contract to create_order (RLS-scoped join; only this
  -- tenant's AVAILABLE items resolve).
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
    raise exception 'update_order: one or more items are invalid or unavailable'
      using errcode = '22023';
  end if;

  v_discount := round(coalesce(v_subtotal, 0)::numeric * v_discount_pct / 100.0);
  v_total    := coalesce(v_subtotal, 0) - v_discount;

  -- Commission on the NET base from the (possibly changed) source's rule.
  v_rate := private.commission_rate_bps(p_source);

  -- Replace the lines wholesale with fresh snapshots.
  delete from public.order_item
  where order_id = v_order.id and business_id = v_business_id;

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

  update public."order"
     set source           = p_source,
         customer_name    = nullif(btrim(coalesce(p_customer_name, '')), ''),
         subtotal_cents   = v_subtotal,
         discount_pct     = v_discount_pct,
         discount_cents   = v_discount,
         commission_cents = round(v_total::numeric * v_rate / 10000.0),
         total_cents      = v_total,
         payment_method   = p_payment_method,
         payment_status   = p_payment_status,
         tendered_cents   = p_tendered_cents
   where id = v_order.id and business_id = v_business_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) from public;
grant execute on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) to authenticated;

comment on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int, int
) is
  'Edit a PENDING order atomically: replace its lines with fresh name/price snapshots and recompute subtotal/discount/commission/total server-side (client totals never trusted); records the tendered cash (change is derived on the bill). Rejects non-pending orders (OR002). SECURITY INVOKER under RLS; authenticated-only.';
