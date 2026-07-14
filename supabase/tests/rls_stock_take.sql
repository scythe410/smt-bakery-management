-- Daily merchandise stock-take (open/close) + audit reconciliation — behaviour
-- and RLS negative tests (CLAUDE.md §4 "Inventory reconciliation", §7).
--
-- Runs inside a transaction and ROLLS BACK — leaves no data behind, so it is safe
-- against any environment (incl. the live seeded demo DB). Seeds two tenants + a
-- user each, merchandise + an ingredient for tenant A, then acts as tenant A's
-- STAFF user (staff may run counts, §5) and asserts:
--   * open_stock_day creates the day and seeds a line per MERCHANDISE item only —
--     the ingredient and a cross-tenant id in the payload are dropped;
--   * open is IDEMPOTENT per date (a second call returns the same day, no dup lines);
--   * close_stock_day writes qty_on_hand to the physical closing count via a
--     count_adjust movement (delta = closing − system); a zero-delta line posts
--     NOTHING; the day flips to closed;
--   * close is IDEMPOTENT (a re-run on a closed day is a no-op — no double adjust);
--   * an ingredient count_adjust (the audit lane) reconciles qty_on_hand too;
--   * tenant A cannot read tenant B's stock_day (RLS).
--
-- Synthetic UUIDs (fc33…, fd44…) are chosen not to collide with any seed row.
--
-- Run: supabase db query --linked -f supabase/tests/rls_stock_take.sql
-- Every row should read pass = true.

begin;

create temp table _t (step text, pass boolean, detail text) on commit drop;
grant insert, select on _t to authenticated;

-- Two tenants.
insert into public.business (id, name) values
  ('fc33fc33-3333-3333-3333-333333333333', 'Take Tenant A'),
  ('fd44fd44-4444-4444-4444-444444444444', 'Take Tenant B');

-- One user per tenant (app_metadata fires the signup trigger → profile). A is STAFF.
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('fc3afc3a-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'takea@a.test',
     jsonb_build_object('business_id', 'fc33fc33-3333-3333-3333-333333333333', 'role', 'staff'),
     jsonb_build_object('name', 'Take A'), now(), now()),
  ('fd4bfd4b-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'takeb@b.test',
     jsonb_build_object('business_id', 'fd44fd44-4444-4444-4444-444444444444', 'role', 'owner'),
     jsonb_build_object('name', 'Take B'), now(), now());

-- Tenant A: two merchandise items + one ingredient (must be excluded from the
-- daily count). Tenant B: one merchandise item.
insert into public.inventory_item (id, business_id, name, kind, category, qty_on_hand, unit, unit_cost_cents, low_stock_threshold) values
  ('c3111111-0000-0000-0000-000000000001', 'fc33fc33-3333-3333-3333-333333333333', 'A Mug',   'merchandise', 'merch',   20.000, 'unit', 60000, 5.000),
  ('c3111111-0000-0000-0000-000000000002', 'fc33fc33-3333-3333-3333-333333333333', 'A Box',   'merchandise', 'merch',   10.000, 'unit', 12000, 3.000),
  ('c3111111-0000-0000-0000-000000000003', 'fc33fc33-3333-3333-3333-333333333333', 'A Flour', 'ingredient',  'baking',   8.000, 'kg',   32000, 2.000),
  ('c4222222-0000-0000-0000-000000000001', 'fd44fd44-4444-4444-4444-444444444444', 'B Mug',   'merchandise', 'merch',    7.000, 'unit', 60000, 1.000);

-- A tenant-B stock_day, seeded now (as the migration role) so business_id stays B —
-- the read-isolation check below proves A can't see it.
insert into public.stock_day (id, business_id, date, status)
values ('fd44fd44-0000-0000-0000-0000000000d1', 'fd44fd44-4444-4444-4444-444444444444', current_date, 'open');

-- ---- Act as tenant A's STAFF user ---------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"fc3afc3a-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

do $$
declare
  v_day     public.stock_day;
  v_day2    public.stock_day;
  v_lines   int;
  v_lineM1  uuid;
  v_lineM2  uuid;
  v_mug     numeric;
  v_box     numeric;
  v_flour   numeric;
  v_adj     int;
  v_status  public.stock_day_status;
  v_bvis    int;
begin
  -- Open the day. Payload includes both merch items, the INGREDIENT, and a
  -- CROSS-TENANT merch id — only the two tenant-A merch items should seed lines.
  v_day := public.open_stock_day(current_date, jsonb_build_array(
    jsonb_build_object('inventory_item_id', 'c3111111-0000-0000-0000-000000000001', 'opening_qty', 25, 'unit_price_cents', 120000),
    jsonb_build_object('inventory_item_id', 'c3111111-0000-0000-0000-000000000002', 'opening_qty', 12, 'unit_price_cents', 15000),
    jsonb_build_object('inventory_item_id', 'c3111111-0000-0000-0000-000000000003', 'opening_qty', 8,  'unit_price_cents', 0),
    jsonb_build_object('inventory_item_id', 'c4222222-0000-0000-0000-000000000001', 'opening_qty', 99, 'unit_price_cents', 0)
  ));

  select count(*) into v_lines from public.stock_count_line where stock_day_id = v_day.id;
  insert into _t values ('open seeds a line per MERCHANDISE item only (ingredient + cross-tenant dropped)',
    v_lines = 2 and v_day.status = 'open', format('lines=%s status=%s', v_lines, v_day.status));

  -- Idempotent open: a second call returns the SAME day, no duplicate lines.
  v_day2 := public.open_stock_day(current_date, jsonb_build_array(
    jsonb_build_object('inventory_item_id', 'c3111111-0000-0000-0000-000000000001', 'opening_qty', 999, 'unit_price_cents', 1)
  ));
  select count(*) into v_lines from public.stock_count_line where stock_day_id = v_day.id;
  insert into _t values ('open is idempotent per date (same day, no reseed)',
    v_day2.id = v_day.id and v_lines = 2, format('same=%s lines=%s', v_day2.id = v_day.id, v_lines));

  select id into v_lineM1 from public.stock_count_line
    where stock_day_id = v_day.id and inventory_item_id = 'c3111111-0000-0000-0000-000000000001';
  select id into v_lineM2 from public.stock_count_line
    where stock_day_id = v_day.id and inventory_item_id = 'c3111111-0000-0000-0000-000000000002';

  -- Close: Mug physical closing 18 (system 20 ⇒ delta −2); Box closing 10 (== system
  -- 10 ⇒ delta 0, no movement). qty_on_hand becomes the physical count.
  v_day := public.close_stock_day(v_day.id, jsonb_build_array(
    jsonb_build_object('line_id', v_lineM1, 'closing_qty', 18, 'received_qty', 0),
    jsonb_build_object('line_id', v_lineM2, 'closing_qty', 10, 'received_qty', 0)
  ));

  select qty_on_hand into v_mug from public.inventory_item where id = 'c3111111-0000-0000-0000-000000000001';
  select qty_on_hand into v_box from public.inventory_item where id = 'c3111111-0000-0000-0000-000000000002';
  select count(*) into v_adj from public.stock_movement
    where ref_stock_day_id = v_day.id and reason = 'count_adjust';

  insert into _t values ('close writes qty_on_hand to the physical closing count',
    v_mug = 18.000 and v_box = 10.000 and v_day.status = 'closed',
    format('mug=%s box=%s status=%s', v_mug, v_box, v_day.status));
  insert into _t values ('close posts one count_adjust (zero-delta line posts nothing)',
    v_adj = 1, format('count_adjust movements=%s (want 1)', v_adj));

  -- Idempotent close: re-running on a closed day is a no-op — no new adjustment,
  -- qty unchanged.
  perform public.close_stock_day(v_day.id, jsonb_build_array(
    jsonb_build_object('line_id', v_lineM1, 'closing_qty', 5, 'received_qty', 0)
  ));
  select qty_on_hand into v_mug from public.inventory_item where id = 'c3111111-0000-0000-0000-000000000001';
  select count(*) into v_adj from public.stock_movement
    where ref_stock_day_id = v_day.id and reason = 'count_adjust';
  insert into _t values ('close is idempotent (closed day is a no-op)',
    v_mug = 18.000 and v_adj = 1, format('mug=%s adjustments=%s', v_mug, v_adj));

  -- Ingredient audit lane: a count_adjust on an ingredient reconciles qty_on_hand
  -- through the same ledger (what recordStockAudit inserts). Counted 6 vs system 8
  -- ⇒ delta −2 ⇒ qty becomes 6.
  insert into public.stock_movement (inventory_item_id, delta, reason, note)
  values ('c3111111-0000-0000-0000-000000000003', 6.000 - 8.000, 'count_adjust', 'ingredient audit');
  select qty_on_hand into v_flour from public.inventory_item where id = 'c3111111-0000-0000-0000-000000000003';
  insert into _t values ('ingredient audit count_adjust reconciles qty_on_hand',
    v_flour = 6.000, format('flour=%s (want 6)', v_flour));

  -- Cross-tenant read isolation: tenant B's stock_day is invisible to A (RLS).
  select count(*) into v_bvis from public.stock_day
    where business_id = 'fd44fd44-4444-4444-4444-444444444444';
  insert into _t values ('tenant A cannot read tenant B stock_day (RLS)',
    v_bvis = 0, format('B days visible to A=%s', v_bvis));
end $$;

reset role;

select step, pass, detail from _t order by _t.ctid;

rollback;
