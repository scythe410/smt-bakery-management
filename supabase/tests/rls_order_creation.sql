-- create_order RPC — correctness + RLS negative test (CLAUDE.md §3, §7).
--
-- Runs entirely inside a transaction and ROLLS BACK — leaves no data behind, so
-- it is safe against any environment (incl. the live seeded demo DB). Seeds two
-- tenants + a user + an available menu item + a commission rule each, then acts
-- as tenant A's user and asserts, via public.create_order:
--   * numbering is unique + monotonic (back-to-back creates never collide);
--   * the (business_id, order_no) UNIQUE constraint enforces uniqueness at the
--     DB level — the guarantee that makes a concurrent race safe;
--   * numbering is GAP-TOLERANT: numbers "consumed" by rolled-back allocations
--     leave a gap, and the next create still succeeds and stays unique;
--   * money is recomputed server-side (subtotal from menu price, commission from
--     commission_rule, total = subtotal);
--   * a CROSS-TENANT menu_item id is rejected (invisible under RLS ⇒ raises).
--
-- Synthetic UUIDs (c1…, c2…) are chosen not to collide with any seed row.
--
-- Run: supabase db query --linked -f supabase/tests/rls_order_creation.sql
-- Every row should read pass = true.

begin;

create temp table _t (step text, pass boolean, detail text) on commit drop;
grant insert, select on _t to authenticated;

-- Two tenants (fresh order_seq = 1000 default ⇒ first number is ORD-1001).
insert into public.business (id, name) values
  ('c1c1c1c1-1111-1111-1111-111111111111', 'Order Tenant A'),
  ('c2c2c2c2-2222-2222-2222-222222222222', 'Order Tenant B');

-- One user per tenant, provisioned via app_metadata (fires the signup trigger).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('c1a1c1a1-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'ordera@a.test',
     jsonb_build_object('business_id', 'c1c1c1c1-1111-1111-1111-111111111111', 'role', 'staff'),
     jsonb_build_object('name', 'Order A'), now(), now()),
  ('c2b2c2b2-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'orderb@b.test',
     jsonb_build_object('business_id', 'c2c2c2c2-2222-2222-2222-222222222222', 'role', 'owner'),
     jsonb_build_object('name', 'Order B'), now(), now());

-- An available menu item + a commission rule for each tenant.
insert into public.menu_item (id, business_id, name, price_cents, is_available) values
  ('c1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'c1c1c1c1-1111-1111-1111-111111111111', 'A Cake', 10000, true),
  ('c2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'c2c2c2c2-2222-2222-2222-222222222222', 'B Cake', 20000, true);

insert into public.commission_rule (business_id, source, rate_bps) values
  ('c1c1c1c1-1111-1111-1111-111111111111', 'uber_eats', 3000);  -- 30%

-- ---- Act as tenant A's user ---------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"c1a1c1a1-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

do $$
declare
  v_o1  public."order";
  v_o2  public."order";
  v_o3  public."order";
  v_n1  bigint;
  v_n2  bigint;
  v_n3  bigint;
  v_items int;
  v_line  public.order_item;
begin
  -- Two back-to-back creates. uber_eats @ 30% on 10000 × 2 = subtotal 20000,
  -- commission 6000, total 20000. Prices/commission are recomputed by the RPC.
  v_o1 := public.create_order('uber_eats', '  Ann  ', 'wallet', 'unpaid',
    jsonb_build_array(jsonb_build_object('menu_item_id', 'c1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'qty', 2)));
  v_o2 := public.create_order('walk_in', null, 'cash', 'paid',
    jsonb_build_array(jsonb_build_object('menu_item_id', 'c1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'qty', 1)));

  v_n1 := (regexp_replace(v_o1.order_no, '[^0-9]', '', 'g'))::bigint;
  v_n2 := (regexp_replace(v_o2.order_no, '[^0-9]', '', 'g'))::bigint;

  insert into _t values ('server recomputes money (subtotal/commission/total)',
    v_o1.subtotal_cents = 20000 and v_o1.commission_cents = 6000 and v_o1.total_cents = 20000,
    format('subtotal=%s commission=%s total=%s', v_o1.subtotal_cents, v_o1.commission_cents, v_o1.total_cents));

  insert into _t values ('customer name trimmed; walk-in null preserved',
    v_o1.customer_name = 'Ann' and v_o2.customer_name is null, 'names ok');

  insert into _t values ('order_no unique + monotonic on back-to-back creates',
    v_o1.order_no <> v_o2.order_no and v_n2 = v_n1 + 1,
    format('n1=%s n2=%s', v_n1, v_n2));

  -- Line items were snapshotted (name + unit price) in the same transaction.
  select count(*) into v_items from public.order_item where order_id = v_o1.id;
  select * into v_line from public.order_item where order_id = v_o1.id;
  insert into _t values ('order_item snapshot written atomically',
    v_items = 1 and v_line.qty = 2 and v_line.unit_price_cents = 10000 and v_line.name_snapshot = 'A Cake',
    format('items=%s qty=%s price=%s name=%s', v_items, v_line.qty, v_line.unit_price_cents, v_line.name_snapshot));

  -- DB-level uniqueness: manually re-inserting an existing order_no must fail
  -- (this is what makes a concurrent race safe even if two callers ever raced).
  begin
    insert into public."order" (business_id, order_no, source)
    values ('c1c1c1c1-1111-1111-1111-111111111111', v_o1.order_no, 'walk_in');
    insert into _t values ('duplicate order_no rejected by UNIQUE constraint', false, 'duplicate insert unexpectedly succeeded');
  exception when unique_violation then
    insert into _t values ('duplicate order_no rejected by UNIQUE constraint', true, sqlerrm);
  end;

  -- Gap tolerance: "consume" two numbers (as rolled-back allocations would),
  -- opening a gap, then create again — it still succeeds and stays unique.
  perform private.next_order_seq();
  perform private.next_order_seq();
  v_o3 := public.create_order('walk_in', null, 'cash', 'paid',
    jsonb_build_array(jsonb_build_object('menu_item_id', 'c1111111-e1e1-e1e1-e1e1-e1e1e1e1e1e1', 'qty', 1)));
  v_n3 := (regexp_replace(v_o3.order_no, '[^0-9]', '', 'g'))::bigint;
  insert into _t values ('numbering is gap-tolerant (consumed numbers skipped, still unique)',
    v_n3 = v_n2 + 3 and v_o3.order_no not in (v_o1.order_no, v_o2.order_no),
    format('n2=%s n3=%s (gap of 2 consumed)', v_n2, v_n3));

  -- Cross-tenant item id: tenant B's menu item is invisible under RLS, so the
  -- RPC cannot resolve it and rejects the whole order (nothing is written).
  begin
    perform public.create_order('walk_in', null, 'cash', 'unpaid',
      jsonb_build_array(jsonb_build_object('menu_item_id', 'c2222222-e2e2-e2e2-e2e2-e2e2e2e2e2e2', 'qty', 1)));
    insert into _t values ('cross-tenant item id rejected', false, 'unexpectedly succeeded');
  exception when others then
    insert into _t values ('cross-tenant item id rejected', true, sqlerrm);
  end;
end $$;

reset role;

-- Return results (as postgres again).
select step, pass, detail from _t order by _t.ctid;

rollback;
