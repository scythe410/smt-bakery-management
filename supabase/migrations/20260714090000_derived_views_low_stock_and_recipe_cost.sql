-- Migration 007 — derived views: push two per-row aggregations into the database
--
-- Two shell/finance reads were pulling rows only to reduce them in JS. Both are
-- replaced by security-invoker views so the work happens in Postgres and the wire
-- carries the answer, not the raw rows.
--
--   * MED-4  Low-stock badge: the count is `qty_on_hand <= low_stock_threshold`,
--            a column-vs-column comparison PostgREST cannot express as a filter,
--            so the caller pulled every item's two numeric columns and counted in
--            JS. inventory_low_stock lets the caller `count(head)` per tenant — no
--            rows transferred.
--   * MED-7  Recipe COGS: the caller read recipe_line and inventory_item
--            separately and joined them in JS. recipe_cost_line does the join in
--            the database, one round trip.
--
-- Security posture (CLAUDE.md §7):
--   * Both views are `security_invoker = on` (Postgres 15+, we run 17), so the
--     underlying tables' RLS is evaluated as the QUERYING role, not the view
--     owner. An authenticated caller therefore sees only its own tenant's rows
--     automatically; the view opens no cross-tenant path.
--   * The service-role callers (cached selectors) BYPASS RLS, so — exactly as with
--     the base tables — they still filter `business_id` explicitly. Tenant scope
--     comes from the caller's server-resolved business_id, never auth.uid()
--     (auth.uid() is the user id, not the business id).
--   * Views inherit no privileges; select is granted to the same API roles that
--     read the base tables. RLS still gates every row for anon/authenticated.

-- ---------------------------------------------------------------------------
-- 1. Low-stock items — one row per item at/under its threshold (id, business_id).
--    Callers `.select('id', { count: 'exact', head: true }).eq('business_id', …)`.
-- ---------------------------------------------------------------------------
create or replace view public.inventory_low_stock
  with (security_invoker = on) as
  select id, business_id
  from public.inventory_item
  where qty_on_hand <= low_stock_threshold;

comment on view public.inventory_low_stock is
  'Low-stock items (qty_on_hand <= low_stock_threshold) as (id, business_id). security_invoker: the querier''s RLS applies. Service-role callers still filter business_id. Powers the Inventory nav/pill badge count (MED-4).';

-- ---------------------------------------------------------------------------
-- 2. Recipe cost lines — recipe_line joined to each ingredient's unit cost.
--    LEFT JOIN + coalesce reproduces the previous JS semantics EXACTLY: one row
--    per recipe line, and a line whose ingredient is missing contributes cost 0
--    (it is not dropped), so COGS/Est. Net Profit reconcile unchanged. The join
--    also matches business_id as defence in depth (ids are globally unique, but a
--    cross-tenant pairing must never contribute a cost).
-- ---------------------------------------------------------------------------
create or replace view public.recipe_cost_line
  with (security_invoker = on) as
  select
    rl.business_id,
    rl.menu_item_id,
    rl.qty,
    coalesce(inv.unit_cost_cents, 0) as unit_cost_cents
  from public.recipe_line rl
  left join public.inventory_item inv
    on inv.id = rl.inventory_item_id
   and inv.business_id = rl.business_id;

comment on view public.recipe_cost_line is
  'recipe_line joined to ingredient unit_cost_cents (LEFT JOIN, missing → 0), one row per BOM line, for COGS derivation. security_invoker: the querier''s RLS applies. Service-role callers still filter business_id (MED-7).';

-- ---------------------------------------------------------------------------
-- 3. Grants — mirror the base tables' Data API exposure. service_role bypasses
--    RLS; anon/authenticated are still gated by the underlying policies.
-- ---------------------------------------------------------------------------
grant select on public.inventory_low_stock to anon, authenticated, service_role;
grant select on public.recipe_cost_line   to anon, authenticated, service_role;
