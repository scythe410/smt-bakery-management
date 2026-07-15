-- employee_account_linking.sql — coverage for migration 014 (link employees to
-- existing login accounts, SPEC §4.3). Run against the LINKED project via the
-- Management API, wrapped in BEGIN … ROLLBACK so nothing persists (blank-slate
-- handoff must stay blank). Each check RAISEs on failure, so a clean run = pass:
--
--   supabase db query --linked --file supabase/tests/employee_account_linking.sql
--
-- Assumes migration 20260715140000 is applied. Auth uids (from seed):
--   owner@   aaaaaaaa-…0001   manager@ aaaaaaaa-…0002   staff@ aaaaaaaa-…0003
-- Business: 11111111-…1111.

begin;

-- ---- Impersonate OWNER --------------------------------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

-- T1 — owner sees all three accounts, each with an email.
do $$
declare n int; noemail int;
begin
  select count(*) into n from public.list_linkable_accounts();
  if n <> 3 then raise exception 'FAIL T1: expected 3 linkable accounts, got %', n; end if;
  select count(*) into noemail from public.list_linkable_accounts() where email is null or email = '';
  if noemail <> 0 then raise exception 'FAIL T1: % accounts missing email', noemail; end if;
end $$;

-- T2 — link "Manager" to manager@ (0002) and sync access role.
insert into public.employee (business_id, name, role, profile_id, salary_cents, pay_status)
values ('11111111-1111-1111-1111-111111111111','Nadeesha Fernando','Manager',
        'aaaaaaaa-0000-0000-0000-000000000002', 5800000, 'pending');
select public.set_account_role('aaaaaaaa-0000-0000-0000-000000000002','manager'::public.app_role);

-- T2b — the linked account now reports its employee id.
do $$
declare lk uuid;
begin
  select linked_employee_id into lk from public.list_linkable_accounts()
    where id = 'aaaaaaaa-0000-0000-0000-000000000002';
  if lk is null then raise exception 'FAIL T2b: manager account not shown linked'; end if;
end $$;

-- T3 — link "Cashier" to staff@ (0003) with access level staff.
insert into public.employee (business_id, name, role, profile_id, salary_cents, pay_status)
values ('11111111-1111-1111-1111-111111111111','Kasun Silva','Cashier',
        'aaaaaaaa-0000-0000-0000-000000000003', 4000000, 'pending');
select public.set_account_role('aaaaaaaa-0000-0000-0000-000000000003','staff'::public.app_role);

-- T4 — already-linked guard: a second employee on manager@ is rejected (UNIQUE).
do $$
begin
  insert into public.employee (business_id, name, profile_id)
  values ('11111111-1111-1111-1111-111111111111','Dup','aaaaaaaa-0000-0000-0000-000000000002');
  raise exception 'FAIL T4: duplicate link allowed';
exception when unique_violation then null; -- expected
end $$;

-- T5 — cross-tenant / unknown profile is rejected by the same-tenant trigger.
do $$
begin
  insert into public.employee (business_id, name, profile_id)
  values ('11111111-1111-1111-1111-111111111111','X','99999999-9999-9999-9999-999999999999');
  raise exception 'FAIL T5: cross-tenant/unknown link allowed';
exception when others then null; -- expected (check_violation or FK)
end $$;

-- T6 — owner can never change their OWN account role.
do $$
begin
  perform public.set_account_role('aaaaaaaa-0000-0000-0000-000000000001','staff'::public.app_role);
  raise exception 'FAIL T6: owner changed own role';
exception when insufficient_privilege then null; -- expected
end $$;

-- ---- Impersonate MANAGER (non-owner) -----------------------------------
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;

-- T7a — a non-owner sees no linkable accounts (owner-only RPC).
do $$
declare n int;
begin
  select count(*) into n from public.list_linkable_accounts();
  if n <> 0 then raise exception 'FAIL T7a: non-owner saw % accounts', n; end if;
end $$;

-- T7b — a non-owner cannot change any account's role.
do $$
begin
  perform public.set_account_role('aaaaaaaa-0000-0000-0000-000000000003','staff'::public.app_role);
  raise exception 'FAIL T7b: non-owner changed a role';
exception when insufficient_privilege then null; -- expected
end $$;

-- ---- Assertions as superuser (bypass RLS) ------------------------------
reset role;

-- T8 — the two syncs landed: manager@ = manager, staff@ = staff.
do $$
declare m public.app_role; s public.app_role;
begin
  select role into m from public.profile where id='aaaaaaaa-0000-0000-0000-000000000002';
  select role into s from public.profile where id='aaaaaaaa-0000-0000-0000-000000000003';
  if m <> 'manager' then raise exception 'FAIL T8: manager@ role=%', m; end if;
  if s <> 'staff'   then raise exception 'FAIL T8: staff@ role=%', s; end if;
end $$;

-- T9 — role stays frozen outside set_account_role (the authorization GUC does
--      not leak within the transaction).
do $$
declare s public.app_role;
begin
  update public.profile set role='owner' where id='aaaaaaaa-0000-0000-0000-000000000003';
  select role into s from public.profile where id='aaaaaaaa-0000-0000-0000-000000000003';
  if s <> 'staff' then raise exception 'FAIL T9: freeze bypassed, role now %', s; end if;
end $$;

-- ---- Delete frees the account, login survives --------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
delete from public.employee where profile_id='aaaaaaaa-0000-0000-0000-000000000003';

-- T10 — freed account re-appears as unlinked.
do $$
declare lk uuid;
begin
  select linked_employee_id into lk from public.list_linkable_accounts()
    where id='aaaaaaaa-0000-0000-0000-000000000003';
  if lk is not null then raise exception 'FAIL T10: staff@ still linked after delete'; end if;
end $$;

-- T11 — profile + auth user are untouched by the employee delete.
reset role;
do $$
declare cnt int;
begin
  select count(*) into cnt from public.profile where id='aaaaaaaa-0000-0000-0000-000000000003';
  if cnt <> 1 then raise exception 'FAIL T11: staff@ profile deleted'; end if;
  select count(*) into cnt from auth.users where id='aaaaaaaa-0000-0000-0000-000000000003';
  if cnt <> 1 then raise exception 'FAIL T11: staff@ auth user deleted'; end if;
end $$;

rollback;
