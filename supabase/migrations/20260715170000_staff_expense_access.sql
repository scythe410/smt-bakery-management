-- Migration — staff may record + view EXPENSES (a cost), nothing else on money.
--
-- CF5 (CLAUDE.md §5) hides income / revenue / profit from the staff role — NOT
-- costs. An expense is a cost and exposes no sales figure, so letting the staff
-- login record and view expenses is consistent with CF5. This adds PERMISSIVE
-- staff policies to public.expense (they OR-combine with the existing
-- owner/manager policy) and deliberately touches NOTHING else: commission_rule
-- and every revenue aggregate stay owner/manager-only, so staff can never derive
-- net revenue, platform earnings, or profit.
--
-- Staff's expense rights:
--   * SELECT — the tenant's expense ledger (read the business's costs).
--   * INSERT — add an expense for their business (business_id / created_by are
--              set server-side by the action; WITH CHECK re-scopes the tenant).
--   * UPDATE / DELETE — ONLY rows they created (created_by = auth.uid()), so a
--              cashier can fix their own entry but never touch anyone else's.
-- Every staff policy pins business_id = current tenant, so cross-tenant access is
-- impossible (CLAUDE.md §7.2). created_by = profile.id = auth.uid() (the profile
-- PK is the auth uid), so the ownership check is a direct uid match.
--
-- Negative test (dev, see supabase/tests/rls_staff_expense.sql): signed in as
-- staff, expense SELECT/INSERT succeed within the tenant; UPDATE/DELETE of a row
-- created by the owner affect 0 rows; commission_rule SELECT returns 0 rows.

-- SELECT: staff reads its own tenant's expense rows.
create policy "expense: staff read" on public.expense
  for select to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() = 'staff'
  );

-- INSERT: staff adds an expense to its own tenant.
create policy "expense: staff insert" on public.expense
  for insert to authenticated
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() = 'staff'
  );

-- UPDATE: staff edits ONLY rows it created — and can neither move them to another
-- tenant nor reassign ownership (both pinned in USING and WITH CHECK).
create policy "expense: staff update own" on public.expense
  for update to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() = 'staff'
    and created_by = (select auth.uid())
  )
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() = 'staff'
    and created_by = (select auth.uid())
  );

-- DELETE: staff removes ONLY rows it created.
create policy "expense: staff delete own" on public.expense
  for delete to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() = 'staff'
    and created_by = (select auth.uid())
  );
