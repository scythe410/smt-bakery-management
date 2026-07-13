-- stock_movement ledger — recipe deduction, reversal, idempotency + RLS negative
-- tests (CLAUDE.md §4 "Inventory reconciliation", §7).
--
-- Runs inside a transaction and ROLLS BACK — leaves no data behind, so it is safe
-- against any environment (incl. the live seeded demo DB). Seeds two tenants +
-- a user each, an ingredient / merchandise / low-stock item and a menu item whose
-- recipe consumes all three, then acts as tenant A's user and asserts:
--   * a pending→completed order DEDUCTS ingredients through the ledger, and
--     qty_on_hand is the running total (recipe_qty × order_qty per ingredient);
--   * merchandise consumed as a qty-1 recipe line deducts 1:1;
--   * stock is allowed to go NEGATIVE (a sale is never blocked on low stock);
--   * deduction is IDEMPOTENT — a re-run (double-submit / retry) posts nothing
--     and does not move qty_on_hand again (partial unique index + ON CONFLICT);
--   * cancelling REVERSES atomically (qty restored), and reversal is idempotent;
--   * a CROSS-TENANT movement (referencing tenant B's item) is rejected;
--   * recipe_line.unit must equal the ingredient's stocking unit (enforced).
--
-- Synthetic UUIDs (fa11…, fb22…) are chosen not to collide with any seed row.
--
-- Run: supabase db query --linked -f supabase/tests/rls_stock_movement.sql
-- Every row should read pass = true.

begin;

create temp table _t (step text, pass boolean, detail text) on commit drop;
grant insert, select on _t to authenticated;

-- Two tenants.
insert into public.business (id, name) values
  ('fa11fa11-1111-1111-1111-111111111111', 'Stock Tenant A'),
  ('fb22fb22-2222-2222-2222-222222222222', 'Stock Tenant B');

-- One user per tenant (app_metadata fires the signup trigger → profile).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('fa1afa1a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'stocka@a.test',
     jsonb_build_object('business_id', 'fa11fa11-1111-1111-1111-111111111111', 'role', 'staff'),
     jsonb_build_object('name', 'Stock A'), now(), now()),
  ('fb2bfb2b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'stockb@b.test',
     jsonb_build_object('business_id', 'fb22fb22-2222-2222-2222-222222222222', 'role', 'owner'),
     jsonb_build_object('name', 'Stock B'), now(), now());

-- Tenant A inventory: a fractional ingredient, a merchandise (1:1), and an almost
-- empty ingredient (to force negative stock). Tenant B: one ingredient.
insert into public.inventory_item (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold) values
  ('d1111111-0000-0000-0000-000000000001', 'fa11fa11-1111-1111-1111-111111111111', 'A Flour',   'ingredient',  'baking',    10.000, 'kg',   32000, 2.000),
  ('d1111111-0000-0000-0000-000000000002', 'fa11fa11-1111-1111-1111-111111111111', 'A Cup',     'merchandise', 'merch',    100.000, 'unit',  2500, 20.000),
  ('d1111111-0000-0000-0000-000000000003', 'fa11fa11-1111-1111-1111-111111111111', 'A Vanilla', 'ingredient',  'baking',     0.001, 'L',   220000, 1.000),
  ('d2222222-0000-0000-0000-000000000001', 'fb22fb22-2222-2222-2222-222222222222', 'B Flour',   'ingredient',  'baking',     5.000, 'kg',   30000, 1.000);

-- A menu item whose recipe consumes all three tenant-A items.
insert into public.menu_item (id, business_id, name, price_cents, is_available) values
  ('e1111111-0000-0000-0000-000000000001', 'fa11fa11-1111-1111-1111-111111111111', 'A Combo', 50000, true);

insert into public.recipe_line (business_id, menu_item_id, inventory_item_id, qty, unit) values
  ('fa11fa11-1111-1111-1111-111111111111', 'e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 0.120, 'kg'),   -- flour
  ('fa11fa11-1111-1111-1111-111111111111', 'e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000002', 1.000, 'unit'), -- cup (1:1)
  ('fa11fa11-1111-1111-1111-111111111111', 'e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000003', 0.005, 'L');    -- vanilla

-- A tenant-B movement, seeded now (as the migration role, before any jwt claim is
-- set) so business_id stays B — the read-isolation check below proves A can't see it.
insert into public.stock_movement (business_id, inventory_item_id, delta, reason)
values ('fb22fb22-2222-2222-2222-222222222222', 'd2222222-0000-0000-0000-000000000001', -1.000, 'manual');

-- ---- Act as tenant A's user ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"fa1afa1a-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

do $$
declare
  v_o        public."order";
  v_flour    numeric;
  v_cup      numeric;
  v_vanilla  numeric;
  v_sales    int;
  v_revs     int;
begin
  -- Order of 2 combos (pending). No deduction yet: pending is not realized.
  v_o := public.create_order('walk_in', 'Test', 'cash', 'paid',
    jsonb_build_array(jsonb_build_object('menu_item_id', 'e1111111-0000-0000-0000-000000000001', 'qty', 2)));

  select qty_on_hand into v_flour from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000001';
  insert into _t values ('pending order does NOT deduct (not realized)',
    v_flour = 10.000, format('flour=%s', v_flour));

  -- Realize the order (pending → completed): the order trigger deducts.
  update public."order" set status = 'completed' where id = v_o.id;

  select qty_on_hand into v_flour   from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000001';
  select qty_on_hand into v_cup     from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000002';
  select qty_on_hand into v_vanilla from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000003';

  -- flour 10 - 0.120×2 = 9.760 ; cup 100 - 1×2 = 98 ; vanilla 0.001 - 0.005×2 = -0.009
  insert into _t values ('realized order deducts recipe_qty × order_qty (fractional)',
    v_flour = 9.760, format('flour=%s (want 9.760)', v_flour));
  insert into _t values ('merchandise consumed as a qty-1 line deducts 1:1',
    v_cup = 98.000, format('cup=%s (want 98)', v_cup));
  insert into _t values ('stock is allowed to go NEGATIVE (sale never blocked)',
    v_vanilla = -0.009, format('vanilla=%s (want -0.009)', v_vanilla));

  select count(*) into v_sales from public.stock_movement
    where ref_order_id = v_o.id and reason = 'sale';
  insert into _t values ('one aggregated sale movement per ingredient (3)',
    v_sales = 3, format('sale movements=%s', v_sales));

  -- Idempotency (double-submit / retry): re-running the deduction posts nothing
  -- and does not move qty_on_hand again.
  perform private.deduct_order_sale(v_o.id);
  select count(*) into v_sales from public.stock_movement
    where ref_order_id = v_o.id and reason = 'sale';
  select qty_on_hand into v_flour from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000001';
  insert into _t values ('deduction is idempotent (no new movement, qty unchanged)',
    v_sales = 3 and v_flour = 9.760, format('sale movements=%s flour=%s', v_sales, v_flour));

  -- Reversal: cancel the order → compensating positive movements restore stock.
  update public."order" set status = 'cancelled' where id = v_o.id;
  select qty_on_hand into v_flour   from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000001';
  select qty_on_hand into v_vanilla from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000003';
  select count(*) into v_revs from public.stock_movement
    where ref_order_id = v_o.id and reason = 'sale_reversal';
  insert into _t values ('cancel posts sale_reversal, restoring qty_on_hand',
    v_flour = 10.000 and v_vanilla = 0.001 and v_revs = 3,
    format('flour=%s vanilla=%s reversals=%s', v_flour, v_vanilla, v_revs));

  -- Reversal is idempotent too.
  perform private.reverse_order_sale(v_o.id);
  select count(*) into v_revs from public.stock_movement
    where ref_order_id = v_o.id and reason = 'sale_reversal';
  select qty_on_hand into v_flour from public.inventory_item where id = 'd1111111-0000-0000-0000-000000000001';
  insert into _t values ('reversal is idempotent (no new movement, qty unchanged)',
    v_revs = 3 and v_flour = 10.000, format('reversals=%s flour=%s', v_revs, v_flour));

  -- Cross-tenant: a movement referencing tenant B's item is rejected (business_id
  -- is stamped to A; the composite FK (item, business_id) then finds no match).
  begin
    insert into public.stock_movement (inventory_item_id, delta, reason)
    values ('d2222222-0000-0000-0000-000000000001', -1.000, 'manual');
    insert into _t values ('cross-tenant movement rejected', false, 'unexpectedly succeeded');
  exception when others then
    insert into _t values ('cross-tenant movement rejected', true, sqlerrm);
  end;

  -- Unit safety: a recipe_line whose unit differs from the ingredient's stocking
  -- unit is rejected (never convert silently).
  begin
    insert into public.recipe_line (menu_item_id, inventory_item_id, qty, unit)
    values ('e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001', 100.000, 'g');
    insert into _t values ('recipe_line unit mismatch rejected', false, 'unexpectedly succeeded');
  exception when others then
    insert into _t values ('recipe_line unit mismatch rejected', true, sqlerrm);
  end;

  -- Cross-tenant read isolation: the tenant-B movement seeded above is invisible
  -- to A under RLS (the SELECT policy scopes to current_business_id()).
  select count(*) into v_sales from public.stock_movement
    where business_id = 'fb22fb22-2222-2222-2222-222222222222';
  insert into _t values ('tenant A cannot read tenant B movements (RLS)',
    v_sales = 0, format('B movements visible to A=%s', v_sales));
end $$;

reset role;

select step, pass, detail from _t order by _t.ctid;

rollback;
