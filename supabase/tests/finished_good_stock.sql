-- finished_good_stock.sql — coverage for migrations 018a/018b (FT3: the
-- finished-good inventory lane, produce_batch, production alerts, and the
-- made-to-order XOR sold-from-stock guard). SPEC §3.3 / CLAUDE.md §4. Run against
-- the LINKED project, wrapped in BEGIN … ROLLBACK so nothing persists (blank-slate
-- handoff must stay blank). Each check RAISEs on failure ⇒ a clean run = pass:
--
--   supabase db query --linked --file supabase/tests/finished_good_stock.sql
--
-- Assumes migrations through 20260716091000 are applied. Auth uids (from seed):
--   owner@ aaaaaaaa-…0001   staff@ aaaaaaaa-…0003.  Business 11111111-…1111.
-- The test provisions its own finished good + menu item so it does not depend on
-- any seeded catalogue (the handoff instance is blank).

begin;

-- ---- Impersonate OWNER --------------------------------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- Fixtures: a finished good (0 on hand, reorder at 10) + a menu item SOLD FROM
-- STOCK (tracked_inventory_item_id → the good). Plus an ingredient for the
-- mutual-exclusion checks.
insert into public.inventory_item (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold)
values
  ('dddddddd-0000-0000-0000-0000000000f1','11111111-1111-1111-1111-111111111111','Test Hot Dog','finished_good','baking',0,'each',12000,10),
  ('dddddddd-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111','Test Salt','ingredient','baking',500,'g',5,10);

insert into public.menu_item (id, business_id, name, price_cents, category, is_available, tracked_inventory_item_id)
values ('dddddddd-0000-0000-0000-0000000000b1','11111111-1111-1111-1111-111111111111','Test Hot Dog',45000,'baking',true,'dddddddd-0000-0000-0000-0000000000f1');

-- T1 — produce_batch(+20): qty 0 → 20, exactly one `production` movement.
do $$
declare v_qty numeric; n int;
begin
  perform public.produce_batch('dddddddd-0000-0000-0000-0000000000f1', 20, 'morning batch');
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 20 then raise exception 'FAIL T1: expected qty 20 after produce, got %', v_qty; end if;
  select count(*) into n from public.stock_movement
    where inventory_item_id = 'dddddddd-0000-0000-0000-0000000000f1' and reason = 'production';
  if n <> 1 then raise exception 'FAIL T1: expected 1 production movement, got %', n; end if;
end $$;

-- T2 — sell 10 via an order → complete → finished good 20 → 10, one `sale` of -10.
do $$
declare v_order public."order"; v_qty numeric; v_delta numeric;
begin
  v_order := public.create_order(
    'walk_in'::public.order_source, 'Test Customer',
    'cash'::public.payment_method, 'paid'::public.payment_status,
    '[{"menu_item_id":"dddddddd-0000-0000-0000-0000000000b1","qty":10}]'::jsonb
  );
  perform set_config('app.test_order', v_order.id::text, true);

  -- Still pending ⇒ no deduction yet.
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 20 then raise exception 'FAIL T2: pending order deducted stock (qty=%)', v_qty; end if;

  perform public.set_order_status(v_order.id, 'completed'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 10 then raise exception 'FAIL T2: expected qty 10 after sale, got %', v_qty; end if;

  select delta into v_delta from public.stock_movement
    where ref_order_id = v_order.id and inventory_item_id = 'dddddddd-0000-0000-0000-0000000000f1' and reason = 'sale';
  if v_delta <> -10 then raise exception 'FAIL T2: expected sale delta -10, got %', v_delta; end if;
end $$;

-- T3 — at 10 (≤ threshold 10) the good appears in production_alert; re-complete no-op.
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; n int; v_qty numeric;
begin
  select count(*) into n from public.production_alert where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if n <> 1 then raise exception 'FAIL T3: finished good not in production_alert (rows=%)', n; end if;

  perform public.set_order_status(v_id, 'completed'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 10 then raise exception 'FAIL T3: re-complete changed qty (got %)', v_qty; end if;
end $$;

-- T4 — cancel → stock restored 10 → 20, one `sale_reversal` (+10); alert clears.
do $$
declare v_id uuid := current_setting('app.test_order')::uuid; v_qty numeric; n int;
begin
  perform public.set_order_status(v_id, 'cancelled'::public.order_status);
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 20 then raise exception 'FAIL T4: expected qty 20 after cancel, got %', v_qty; end if;
  select count(*) into n from public.stock_movement
    where ref_order_id = v_id and inventory_item_id = 'dddddddd-0000-0000-0000-0000000000f1' and reason = 'sale_reversal';
  if n <> 1 then raise exception 'FAIL T4: expected 1 sale_reversal, got %', n; end if;
  select count(*) into n from public.production_alert where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if n <> 0 then raise exception 'FAIL T4: good still in production_alert after restock (rows=%)', n; end if;
end $$;

-- T5 — a tracked (sold-from-stock) menu item cannot ALSO have a recipe.
do $$
declare v_raised boolean := false;
begin
  begin
    insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit)
    values ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-0000000000b1','dddddddd-0000-0000-0000-0000000000e1',1,'g');
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL T5: recipe on a sold-from-stock item was allowed'; end if;
end $$;

-- T6 — a menu item that HAS a recipe cannot be flipped to sold-from-stock.
do $$
declare v_raised boolean := false;
begin
  insert into public.menu_item (id, business_id, name, price_cents, category, is_available)
  values ('dddddddd-0000-0000-0000-0000000000b2','11111111-1111-1111-1111-111111111111','Test Recipe Item',20000,'baking',true);
  insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit)
  values ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-0000000000b2','dddddddd-0000-0000-0000-0000000000e1',2,'g');

  begin
    update public.menu_item set tracked_inventory_item_id = 'dddddddd-0000-0000-0000-0000000000f1'
    where id = 'dddddddd-0000-0000-0000-0000000000b2';
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL T6: tracked good set on an item with a recipe was allowed'; end if;
end $$;

-- T7 — produce_batch rejects a NON-finished-good target (an ingredient).
do $$
declare v_raised boolean := false;
begin
  begin
    perform public.produce_batch('dddddddd-0000-0000-0000-0000000000e1', 5);
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL T7: produce_batch accepted a non-finished-good'; end if;
end $$;

-- T8 — a finished good cannot be an ingredient INPUT in a recipe (FT2.1 guard).
do $$
declare v_raised boolean := false;
begin
  begin
    insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit)
    values ('11111111-1111-1111-1111-111111111111','dddddddd-0000-0000-0000-0000000000b2','dddddddd-0000-0000-0000-0000000000f1',1,'each');
  exception when others then v_raised := true;
  end;
  if not v_raised then raise exception 'FAIL T8: finished good was allowed as a recipe ingredient'; end if;
end $$;

-- ---- Impersonate STAFF ---------------------------------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- T9 — STAFF (a cashier) can produce a batch: 20 → 25.
do $$
declare v_qty numeric;
begin
  perform public.produce_batch('dddddddd-0000-0000-0000-0000000000f1', 5, 'staff batch');
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> 25 then raise exception 'FAIL T9: staff produce expected qty 25, got %', v_qty; end if;
end $$;

-- T10 — the running total reconciles to the ledger: qty_on_hand = Σ delta.
do $$
declare v_qty numeric; v_sum numeric;
begin
  select qty_on_hand into v_qty from public.inventory_item where id = 'dddddddd-0000-0000-0000-0000000000f1';
  select coalesce(sum(delta),0) into v_sum from public.stock_movement where inventory_item_id = 'dddddddd-0000-0000-0000-0000000000f1';
  if v_qty <> v_sum then raise exception 'FAIL T10: qty_on_hand (%) <> ledger sum (%)', v_qty, v_sum; end if;
end $$;

select 'finished_good_stock: ALL CHECKS PASSED' as result;

rollback;
