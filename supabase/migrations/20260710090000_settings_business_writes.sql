-- Migration 004 — Settings screen: business writes + tenant profile reads
--
-- Enables the Settings screen (SPEC §4.4) to persist business-profile edits and
-- to list the tenant's user accounts, WITHOUT weakening tenant isolation.
--
-- What this adds (all owner/manager-scoped, deny-by-default preserved elsewhere):
--   1. business.notification_preferences (jsonb) — Settings notification toggles.
--   2. business: an OWNER-ONLY update policy + an identity-freeze trigger, so the
--      owner may edit name/logo/currency/timezone/locale/tax_config/notification
--      preferences of THEIR OWN tenant only, and can NEVER change id/created_at or
--      reach another tenant's row (CLAUDE.md §7.2/§7.3).
--   3. profile: an owner/manager tenant-wide SELECT policy (additive to "read
--      own"), so Settings › User Accounts can list the tenant's users. Staff is
--      unaffected — it can still read only its own profile.
--
-- Security notes:
--   * Migrations 001/002 left business + profile with NO client write policies.
--     This migration opens ONLY: business UPDATE (owner) and profile SELECT
--     (owner/manager). No client INSERT/DELETE on either; no staff widening.
--   * The freeze trigger pins id + created_at back to their stored values on
--     every update, so those columns are not client-settable even though the
--     row is now updatable (mirrors profile_freeze_privileged_columns).
--   * private.current_business_id() / current_app_role() are SECURITY DEFINER
--     with a pinned empty search_path and read profile WITHOUT re-triggering RLS,
--     so referencing them from a policy ON profile does not recurse (same pattern
--     the expense/employee policies already rely on).
--
-- Negative test (dev): signed in as staff, `update public.business …` affects 0
-- rows (no owner policy match) and `select … from public.profile` returns only
-- the staff's own row. Signed in as owner of tenant A, an update targeting
-- tenant B's id matches 0 rows (USING/​WITH CHECK both pin id = own business).

-- ---------------------------------------------------------------------------
-- 1. Notification preferences column (Settings toggles). Default: the noisy
--    operational alerts on, the digest off — a sensible starting posture.
-- ---------------------------------------------------------------------------
alter table public.business
  add column if not exists notification_preferences jsonb not null
    default '{"low_stock": true, "new_orders": true, "new_bookings": true, "daily_summary": false}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. business: identity-freeze trigger + owner-only UPDATE policy.
-- ---------------------------------------------------------------------------

-- BEFORE UPDATE: freeze the tenant's identity/creation timestamp. updated_at is
-- bumped by the existing business_set_updated_at trigger; here we only pin the
-- columns a client must never rewrite.
create or replace function private.business_freeze_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.id         := old.id;
  new.created_at := old.created_at;
  return new;
end;
$$;

drop trigger if exists business_freeze_identity on public.business;
create trigger business_freeze_identity
  before update on public.business
  for each row execute function private.business_freeze_identity();

-- Owner may update only their OWN tenant row. USING gates the visible row;
-- WITH CHECK re-asserts the result still belongs to the owner's tenant, so an
-- owner cannot repoint the row at another business_id (the freeze trigger also
-- restores id, making this belt-and-braces).
drop policy if exists "business: owner updates own tenant" on public.business;
create policy "business: owner updates own tenant"
  on public.business
  for update
  to authenticated
  using (
    id = private.current_business_id()
    and private.current_app_role() = 'owner'
  )
  with check (
    id = private.current_business_id()
    and private.current_app_role() = 'owner'
  );

-- ---------------------------------------------------------------------------
-- 3. profile: owner/manager may read all profiles within their own tenant.
--    Permissive, so it OR-combines with "profile: read own" — staff keeps
--    self-only visibility; owner/manager gain the tenant roster (User Accounts).
-- ---------------------------------------------------------------------------
drop policy if exists "profile: owner/manager read tenant" on public.profile;
create policy "profile: owner/manager read tenant"
  on public.profile
  for select
  to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() in ('owner', 'manager')
  );
