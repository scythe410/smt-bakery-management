-- order_status_transition.sql — coverage for migration 016 (set_order_status,
-- ledger-safe status transitions, SPEC §3.4 / CLAUDE.md §4). Run against the
-- LINKED project, wrapped in BEGIN … ROLLBACK so nothing persists (blank-slate
-- handoff must stay blank). Each check RAISEs on failure ⇒ a clean run = pass:
--
--   supabase db query --linked --file supabase/tests/order_status_transition.sql
--
-- Assumes migrations through 20260715160000 are applied. Auth uids (from seed):
--   owner@ aaaaaaaa-…0001   staff@ aaaaaaaa-…0003.  Business 11111111-…1111.
-- The test provisions its own ingredient + menu item + recipe so it does not
-- depend on any seeded catalogue (the handoff instance is blank).

begin;

-- ---- Impersonate OWNER --------------------------------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Fixtures: one ingredient (100 units on hand) + a menu item that consumes 2
-- units of it per sale. recipe_line.unit MUST equal the item's stocking unit.
insert into public.inventory_item (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold)
values ('cccccccc-0000-0000-0000-0000000000a1','11111111-1111-1111-1111-111111111111','Test Flour','ingredient','baking',100,'g',50,10);

insert into public.menu_item (id, business_id, name, price_cents, category, is_available)
values ('cccccccc-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','Test Bun',30000,'baking',true);

insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit)
values ('11111111-1111-1111-1111-111111111111','cccccccc-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000a1',2,'g');

-- Create an order of qty 3 → expected deduction = 2 (recipe) × 3 = 6 units.
do $$
declare v_order public."order"; v_qty numeric;
begin
  v_order := public.create_order(
    'walk_in'::public.order_source, 'Test Customer',
    'cash'::public.payment_method, 'paid'::public.payment_status,
    '[{"menu_item_id":"cccccccc-0000-0000-0000-0000000000b1","qty":3}]'::jsonb
  );
  perform set_config('app.test_order', v_order.id::text, true);

  -- T1 — a new order lands 'pending' and deducts NOTHING yet.
  if v_order.status <> 'pending' then raise exception 'FAIL T1: new order not pending (%)', v_order.status; end if;
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 100 then raise exception 'FAIL T1: pending order deducted stock (qty=%)', v_qty; end if;
end $$;

-- T2 — pending → completed deducts EXACTLY once (6 units), one 'sale' movement.
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; n int; r public."order";
begin
  r := public.set_order_status(v_id, 'completed'::public.order_status);
  if r.status <> 'completed' then raise exception 'FAIL T2: status not completed'; end if;
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 94 then raise exception 'FAIL T2: expected qty 94 after deduct, got %', v_qty; end if;
  select count(*) into n from public.stock_movement where ref_order_id = v_id and reason = 'sale';
  if n <> 1 then raise exception 'FAIL T2: expected 1 sale movement, got %', n; end if;
end $$;

-- T3 — re-running completed → completed is a NO-OP (no double deduct).
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; n int;
begin
  perform public.set_order_status(v_id, 'completed'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 94 then raise exception 'FAIL T3: re-complete changed qty (%)', v_qty; end if;
  select count(*) into n from public.stock_movement where ref_order_id = v_id and reason = 'sale';
  if n <> 1 then raise exception 'FAIL T3: re-complete added a sale movement (n=%)', n; end if;
end $$;

-- T4 — completed → cancelled REVERSES exactly once (stock restored to 100).
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; n int; r public."order";
begin
  r := public.set_order_status(v_id, 'cancelled'::public.order_status);
  if r.status <> 'cancelled' then raise exception 'FAIL T4: status not cancelled'; end if;
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 100 then raise exception 'FAIL T4: expected qty 100 after reversal, got %', v_qty; end if;
  select count(*) into n from public.stock_movement where ref_order_id = v_id and reason = 'sale_reversal';
  if n <> 1 then raise exception 'FAIL T4: expected 1 reversal movement, got %', n; end if;
end $$;

-- T5 — re-running the cancel is a NO-OP (no double reversal).
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; n int;
begin
  perform public.set_order_status(v_id, 'cancelled'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 100 then raise exception 'FAIL T5: re-cancel changed qty (%)', v_qty; end if;
  select count(*) into n from public.stock_movement where ref_order_id = v_id and reason = 'sale_reversal';
  if n <> 1 then raise exception 'FAIL T5: re-cancel added a reversal (n=%)', n; end if;
end $$;

-- T6 — a cancelled order is NOT realized revenue: it is not 'completed'.
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; s public.order_status;
begin
  select status into s from public."order" where id = v_id;
  if s = 'completed' then raise exception 'FAIL T6: cancelled order still realized'; end if;
end $$;

-- T7 — ledger-safety guard: a reversed order CANNOT be completed again (OR001).
do $$
declare v_id uuid := current_setting('app.test_order')::uuid;
begin
  perform public.set_order_status(v_id, 'completed'::public.order_status);
  raise exception 'FAIL T7: re-completing a reversed order was allowed';
exception when sqlstate 'OR001' then null; -- expected
end $$;

-- T8 — reopen: cancelled → pending is allowed and touches no stock.
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; r public."order";
begin
  r := public.set_order_status(v_id, 'pending'::public.order_status);
  if r.status <> 'pending' then raise exception 'FAIL T8: reopen did not set pending'; end if;
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 100 then raise exception 'FAIL T8: reopen changed qty (%)', v_qty; end if;
end $$;

-- T9 — unknown / cross-tenant order id is refused (OR404), never leaked.
do $$
begin
  perform public.set_order_status('00000000-0000-0000-0000-0000000000ff'::uuid, 'completed'::public.order_status);
  raise exception 'FAIL T9: unknown order id was accepted';
exception when sqlstate 'OR404' then null; -- expected
end $$;

-- ---- Impersonate STAFF (a cashier) --------------------------------------
-- Whoever can CREATE an order can complete/cancel it. Staff creates + completes.
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

do $$
declare v_order public."order"; v_qty numeric; r public."order";
begin
  v_order := public.create_order(
    'walk_in'::public.order_source, 'Staff Sale',
    'cash'::public.payment_method, 'paid'::public.payment_status,
    '[{"menu_item_id":"cccccccc-0000-0000-0000-0000000000b1","qty":1}]'::jsonb
  );
  -- T10 — staff can complete an order (deducts 2 units: 100 → 98).
  r := public.set_order_status(v_order.id, 'completed'::public.order_status);
  if r.status <> 'completed' then raise exception 'FAIL T10: staff could not complete'; end if;
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 98 then raise exception 'FAIL T10: expected qty 98 after staff sale, got %', v_qty; end if;
  -- T11 — staff can cancel it too (restores to 100).
  r := public.set_order_status(v_order.id, 'cancelled'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'cccccccc-0000-0000-0000-0000000000a1';
  if v_qty <> 100 then raise exception 'FAIL T11: staff cancel did not restore (qty=%)', v_qty; end if;
end $$;

select 'order_status_transition: ALL CHECKS PASSED' as result;

rollback;
