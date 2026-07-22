-- Migration 026 — update_order: edit a PENDING order atomically
--
-- Client request: "make the orders editable." Same §7.7 hot path contract as
-- create_order: the client sends WHICH menu items and HOW MANY (plus source /
-- customer / payment / discount pct); every money figure is recomputed here from
-- stored prices and commission_rule. The client can never set a price or total.
--
-- PENDING ONLY (errcode OR002 otherwise). Why this is ledger-safe:
--   * Stock deducts on completion (order_sync_stock, migration 016), so a
--     pending order has no live deduction — replacing its lines touches no stock.
--   * A reopened order (completed → cancelled → pending) carries a netted-out
--     sale + reversal pair, and OR001 forbids re-completing it — so an edit
--     there can't resurrect a deduction either.
--   * Completed/cancelled orders stay immutable history: their snapshots are
--     realized revenue / audit rows. Void-and-recreate is the correct path.
--
-- Lines are REPLACED wholesale (delete + insert, one transaction) with fresh
-- name/price snapshots — same semantics as creating the order with the edited
-- cart. order_no / created_at / status are never touched.
--
-- Security (CLAUDE.md §7): SECURITY INVOKER + pinned search_path; the order is
-- resolved under RLS (cross-tenant ids are invisible ⇒ PG002); business_id is
-- re-derived from the session. authenticated-only — any tenant role that can
-- create an order can edit a pending one.

create or replace function public.update_order(
  p_order_id       uuid,
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
         payment_status   = p_payment_status
   where id = v_order.id and business_id = v_business_id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) from public;
grant execute on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) to authenticated;

comment on function public.update_order(
  uuid, public.order_source, text, public.payment_method, public.payment_status, jsonb, int
) is
  'Edit a PENDING order atomically: replace its lines with fresh name/price snapshots and recompute subtotal/discount/commission/total server-side from stored prices (client totals never trusted). Rejects non-pending orders (OR002). SECURITY INVOKER under RLS; authenticated-only.';
