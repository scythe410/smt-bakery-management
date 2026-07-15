-- reset-to-blank.sql — blank-slate the Samanthas Bake House tenant for client handoff.
--
-- Purpose: remove ALL demo/sample business DATA so the owner starts from an empty
-- app and enters their own menu, inventory, employees, costs and prices.
--
-- Scope & safety:
--   * Single transaction. Either the whole reset applies or none of it does.
--   * Tenant-scoped: every statement is bounded to the Samanthas Bake House business_id
--     (resolved by name), so it can never touch another tenant's rows.
--   * Idempotent: DELETEs of already-empty tables are no-ops; the config UPDATE is
--     absolute (not relative), so re-running leaves the same blank state. Safe to re-run.
--   * KEEPS the business row, the auth users, and their profiles — the owner must
--     still be able to log in, and the three demo accounts (owner@ / manager@ /
--     staff@samanthas.demo) are retained so the owner can re-link them to new
--     employee records. Deleting employee rows clears those account links (the link
--     lives on employee, not on profile).
--
-- Apply (Supabase CLI, Management API — no psql/Docker required):
--   supabase db query --linked -f supabase/reset-to-blank.sql
-- `db push` does NOT run ad-hoc SQL scripts; this is a maintenance script, not a migration.

begin;

do $$
declare
  v_business uuid;
begin
  select id into v_business
    from public.business
   where name = 'Samanthas Bake House';

  if v_business is null then
    raise exception 'reset-to-blank: business "Samanthas Bake House" not found — aborting';
  end if;

  -- 1) Delete all business DATA in FK-safe order (children before parents).
  --    Stock ledger + counts first, then orders, then catalog, then reference rows.
  delete from public.stock_movement   where business_id = v_business;
  delete from public.stock_count_line  where business_id = v_business;
  delete from public.stock_day         where business_id = v_business;
  delete from public.order_item        where business_id = v_business;
  delete from public."order"           where business_id = v_business;
  delete from public.expense           where business_id = v_business;
  delete from public.booking           where business_id = v_business;
  delete from public.recipe_line       where business_id = v_business;
  delete from public.menu_item         where business_id = v_business;
  delete from public.inventory_item    where business_id = v_business;
  delete from public.commission_rule   where business_id = v_business;
  delete from public.notification      where business_id = v_business;
  -- employee carries the salary_cents / pay_status / paid_at columns (no separate
  -- pay-status table) and the optional profile link — deleting the rows clears both.
  delete from public.employee          where business_id = v_business;
  -- customer is referenced by order/booking via ON DELETE SET NULL, so it deletes
  -- cleanly after them. Demo/sample customers are business data — remove them too.
  delete from public.customer          where business_id = v_business;

  -- 2) Reset tenant config to a clean blank state.
  --    KEEP: name, currency (LKR), timezone, locale_default.
  --    CLEAR: order counter, logo, tax + notification settings back to their blank defaults.
  --    order_seq is reset to 0 (per the handoff brief) so the client's first real
  --    order is ORD-1. NB: the migration default is 1000 (first order ORD-1001);
  --    starting at 0 is an intentional, documented deviation for the fresh instance.
  update public.business
     set order_seq                = 0,
         logo_url                 = null,
         tax_config               = '{"registered": false, "vat_rate_bps": 0}'::jsonb,
         notification_preferences = '{"low_stock": true, "new_orders": true, "new_bookings": true, "daily_summary": false}'::jsonb,
         updated_at               = now()
   where id = v_business;
end
$$;

commit;
