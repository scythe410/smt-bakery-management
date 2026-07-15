-- Migration 014 — link employees to existing login accounts (SPEC §4.3)
--
-- The blank-slate handoff removed employee HR records but KEPT the three login
-- accounts (owner@/manager@/staff@) and their profiles. This lets an owner
-- re-create employee records and link each one to an existing account, keeping
-- login access (profile.role) in sync with the assigned access level.
--
-- Security posture (CLAUDE.md §3, §7):
--   * One employee per account: UNIQUE (profile_id) — many HR-only records may be
--     unlinked (multiple NULLs are allowed), but an account links at most once.
--   * Deleting an employee never cascades to the profile/auth user: the FK stays
--     `on delete set null` on the PROFILE side only (defined in migration 002); an
--     employee delete just removes the HR row, freeing the account to re-link.
--   * Cross-tenant linking is impossible: a BEFORE trigger rejects a profile_id
--     whose business differs from the employee's (defence-in-depth over the app).
--   * Reading accounts + changing an account's access role are OWNER-ONLY and go
--     through SECURITY DEFINER RPCs with a pinned empty search_path. profile.role
--     stays frozen for every other path (migration 001 freeze trigger), so a
--     client can never escalate its own role — only an owner, via set_account_role,
--     can change ANOTHER account's role, never their own, never an owner account.

-- ---------------------------------------------------------------------------
-- 1. One employee per login account.
-- ---------------------------------------------------------------------------
alter table public.employee
  add constraint employee_profile_id_key unique (profile_id);

comment on constraint employee_profile_id_key on public.employee is
  'At most one employee per login account. NULL profile_id (HR-only records) is exempt: many are allowed.';

-- ---------------------------------------------------------------------------
-- 2. Reject cross-tenant links at the database (BEFORE insert/update on employee).
--    SECURITY DEFINER so it can see the target profile row regardless of the
--    caller's RLS (an owner cannot SELECT other profiles under the read-own
--    policy, so an invoker check would wrongly reject a legitimate same-tenant
--    link). Self-scoped: only ever compares business_id, never returns data.
-- ---------------------------------------------------------------------------
create or replace function private.employee_profile_same_tenant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null then
    if not exists (
      select 1
      from public.profile p
      where p.id = new.profile_id
        and p.business_id = new.business_id
    ) then
      raise exception 'profile_id must belong to the same business'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.employee_profile_same_tenant() from public;

create trigger employee_profile_same_tenant
  before insert or update of profile_id, business_id on public.employee
  for each row execute function private.employee_profile_same_tenant();

-- ---------------------------------------------------------------------------
-- 3. Allow an AUTHORIZED role change to pass the profile freeze trigger.
--    profile.role is frozen on every update (migration 001). set_account_role
--    (below) sets a transaction-local GUC naming the exact profile whose role it
--    is permitted to change; the freeze trigger honours only that one row, for
--    that one transaction. Every other update path still has role forced back.
-- ---------------------------------------------------------------------------
create or replace function private.profile_freeze_privileged_columns()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.id          := old.id;
  new.business_id := old.business_id;
  -- role is frozen UNLESS set_account_role has authorized this exact profile's
  -- role change for the current transaction (transaction-local, is_local GUC).
  if coalesce(current_setting('app.authorized_role_change', true), '')
       is distinct from old.id::text then
    new.role := old.role;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. list_linkable_accounts() — the accounts an owner may link (owner-only).
--    Returns every profile in the caller's tenant with its email (from
--    auth.users, not exposed via the Data API) and the employee it is currently
--    linked to (null = free to link). SECURITY DEFINER so it can read auth.users
--    and sibling profiles; self-scoped to the caller's own business + owner role.
-- ---------------------------------------------------------------------------
create or replace function public.list_linkable_accounts()
returns table (
  id                 uuid,
  email              text,
  role               public.app_role,
  linked_employee_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller public.profile;
begin
  select * into caller from private.current_profile();

  -- Owner-only. Any non-owner (incl. manager, staff) gets an empty set.
  if caller.role is distinct from 'owner'::public.app_role
     or caller.business_id is null then
    return;
  end if;

  return query
  select
    p.id,
    u.email::text,
    p.role,
    e.id as linked_employee_id
  from public.profile p
  join auth.users u on u.id = p.id
  left join public.employee e on e.profile_id = p.id
  where p.business_id = caller.business_id
  order by p.role, u.email;
end;
$$;

revoke all on function public.list_linkable_accounts() from public;
grant execute on function public.list_linkable_accounts() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. set_account_role(target, new_role) — sync a linked account's access role.
--    Owner-only. Guards (all raise, never silently succeed):
--      * caller must be owner with a business;
--      * target must be a profile in the SAME business;
--      * caller can NEVER change their own account's role;
--      * an owner account can never be demoted out of owner.
--    Authorizes the freeze trigger for exactly this profile via a txn-local GUC.
-- ---------------------------------------------------------------------------
create or replace function public.set_account_role(
  target_profile_id uuid,
  new_role          public.app_role
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller public.profile;
  target public.profile;
begin
  select * into caller from private.current_profile();

  if caller.role is distinct from 'owner'::public.app_role
     or caller.business_id is null then
    raise exception 'only an owner may change account roles'
      using errcode = 'insufficient_privilege';
  end if;

  if target_profile_id = caller.id then
    raise exception 'an owner cannot change their own account role'
      using errcode = 'insufficient_privilege';
  end if;

  select * into target
  from public.profile
  where id = target_profile_id
    and business_id = caller.business_id;

  if target.id is null then
    raise exception 'target account is not in this business'
      using errcode = 'check_violation';
  end if;

  -- Never demote an owner account out of the owner role.
  if target.role = 'owner'::public.app_role
     and new_role <> 'owner'::public.app_role then
    raise exception 'an owner account cannot be demoted here'
      using errcode = 'insufficient_privilege';
  end if;

  if target.role = new_role then
    return; -- already in sync; nothing to do
  end if;

  -- Authorize the freeze trigger for THIS profile, then clear immediately so the
  -- window covers only this one UPDATE (defence-in-depth: PostgREST already runs
  -- each RPC in its own transaction, so the is_local GUC never leaks between calls).
  perform set_config('app.authorized_role_change', target_profile_id::text, true);

  update public.profile
  set role = new_role
  where id = target_profile_id
    and business_id = caller.business_id;

  perform set_config('app.authorized_role_change', '', true);
end;
$$;

revoke all on function public.set_account_role(uuid, public.app_role) from public;
grant execute on function public.set_account_role(uuid, public.app_role) to authenticated;
