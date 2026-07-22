-- update_order (migration 026) — edit a PENDING order atomically.
-- Verifies: line replacement + server-side recompute, order_no/status untouched,
-- pending-only guard (OR002), invalid-item rejection (22023).
--
-- Run: supabase db query --linked -f supabase/tests/update_order.sql
-- Everything rolls back; the live instance is untouched.

begin;

select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  v_order    public."order";
  v_edited   public."order";
  v_m1       uuid;
  v_m2       uuid;
  v_p1       int;
  v_p2       int;
  v_lines    int;
  v_qty      int;
  v_caught   boolean;
begin
  -- Two available menu items to build carts from.
  select id, price_cents into v_m1, v_p1
  from public.menu_item where is_available order by item_code limit 1;
  select id, price_cents into v_m2, v_p2
  from public.menu_item where is_available and id <> v_m1 order by item_code limit 1;

  -- 1. Create a pending order with 2 × item1.
  v_order := public.create_order(
    'walk_in', 'Edit Test', 'cash', 'unpaid',
    jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'qty', 2)), 0);

  -- 2. Edit it: 3 × item2, 10% discount, new source/customer/payment.
  v_edited := public.update_order(
    v_order.id, 'whatsapp', 'Edited Name', 'card', 'paid',
    jsonb_build_array(jsonb_build_object('menu_item_id', v_m2, 'qty', 3)), 10);

  if v_edited.order_no <> v_order.order_no then
    raise exception 'FAIL: order_no changed (% -> %)', v_order.order_no, v_edited.order_no;
  end if;
  if v_edited.status <> 'pending' then
    raise exception 'FAIL: status changed to %', v_edited.status;
  end if;
  if v_edited.subtotal_cents <> v_p2::bigint * 3 then
    raise exception 'FAIL: subtotal % <> expected %', v_edited.subtotal_cents, v_p2 * 3;
  end if;
  if v_edited.discount_cents <> round((v_p2::bigint * 3)::numeric * 10 / 100.0) then
    raise exception 'FAIL: discount % wrong', v_edited.discount_cents;
  end if;
  if v_edited.total_cents <> v_edited.subtotal_cents - v_edited.discount_cents then
    raise exception 'FAIL: total % <> subtotal - discount', v_edited.total_cents;
  end if;
  if v_edited.customer_name <> 'Edited Name' or v_edited.source <> 'whatsapp'
     or v_edited.payment_method <> 'card' or v_edited.payment_status <> 'paid' then
    raise exception 'FAIL: metadata not updated';
  end if;

  -- Lines fully replaced: exactly one row, item2 × 3, fresh snapshot price.
  select count(*), max(qty) into v_lines, v_qty
  from public.order_item where order_id = v_order.id;
  if v_lines <> 1 or v_qty <> 3 then
    raise exception 'FAIL: expected 1 line qty 3, got % lines max qty %', v_lines, v_qty;
  end if;
  if not exists (
    select 1 from public.order_item
    where order_id = v_order.id and menu_item_id = v_m2 and unit_price_cents = v_p2
  ) then
    raise exception 'FAIL: replaced line missing or wrong snapshot';
  end if;

  -- 3. Non-pending guard: complete the order, then editing must raise OR002.
  perform public.set_order_status(v_order.id, 'completed');
  v_caught := false;
  begin
    perform public.update_order(
      v_order.id, 'walk_in', '', 'cash', 'unpaid',
      jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'qty', 1)), 0);
  exception when sqlstate 'OR002' then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL: editing a completed order was not rejected';
  end if;

  -- 4. Invalid item id on a fresh pending order → 22023.
  v_order := public.create_order(
    'walk_in', 'Edit Test 2', 'cash', 'unpaid',
    jsonb_build_array(jsonb_build_object('menu_item_id', v_m1, 'qty', 1)), 0);
  v_caught := false;
  begin
    perform public.update_order(
      v_order.id, 'walk_in', '', 'cash', 'unpaid',
      jsonb_build_array(jsonb_build_object(
        'menu_item_id', '00000000-0000-0000-0000-000000000000', 'qty', 1)), 0);
  exception when sqlstate '22023' then
    v_caught := true;
  end;
  if not v_caught then
    raise exception 'FAIL: invalid item id was not rejected';
  end if;

  raise notice 'PASS: update_order recompute, replacement, OR002, 22023 all verified';
end $$;

rollback;

select 'update_order test finished (rolled back)' as result;
