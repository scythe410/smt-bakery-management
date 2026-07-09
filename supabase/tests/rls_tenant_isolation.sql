-- RLS tenant-isolation negative test (CLAUDE.md §7.2).
--
-- Runs entirely inside a transaction and ROLLS BACK — it leaves no data behind,
-- so it is safe to run against any environment. Seeds two tenants + two users
-- (exercising the on-signup trigger), then acts as one user and asserts they
-- cannot see or mutate the other tenant, and cannot escalate their own role or
-- hop tenants. Results are collected into a temp table and returned at the end.
--
-- The synthetic tenant/user UUIDs (f1111111…, 22222222…, aaaa…, bbbb…) are chosen
-- to NOT collide with any seed row, so this runs cleanly against the live seeded
-- demo DB as well as a fresh reset. Assertions on admin-visible tables are scoped
-- to the test rows for the same reason.
--
-- Run: supabase db query --linked -f supabase/tests/rls_tenant_isolation.sql
-- Every row should read pass = true.

begin;

create temp table _t (step text, pass boolean, detail text) on commit drop;
grant insert, select on _t to authenticated;

-- Two tenants
insert into public.business (id, name) values
  ('f1111111-1111-1111-1111-111111111111', 'Tenant A'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B');

-- Two users, each provisioned to a tenant via app_metadata (fires the trigger).
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'alice@a.test',
     jsonb_build_object('business_id', 'f1111111-1111-1111-1111-111111111111', 'role', 'staff'),
     jsonb_build_object('name', 'Alice'), now(), now()),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'bob@b.test',
     jsonb_build_object('business_id', '22222222-2222-2222-2222-222222222222', 'role', 'owner'),
     jsonb_build_object('name', 'Bob'), now(), now());

-- The signup trigger should have created a profile for each new user with
-- server-set fields. Scope the count to the two test users so the assertion is
-- robust when run against a seeded DB (which already has its own profiles).
insert into _t
select 'trigger creates test profiles', count(*) = 2, 'count=' || count(*)
from public.profile
where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
insert into _t
select 'alice profile server-set correctly',
       bool_and(business_id = 'f1111111-1111-1111-1111-111111111111' and role = 'staff' and name = 'Alice'),
       'role/business_id came from app_metadata'
from public.profile where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

-- ---- Act as Alice (Tenant A) --------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}', true);

insert into _t
select 'alice sees only her own tenant', count(*) = 1 and bool_and(name = 'Tenant A'), 'businesses visible=' || count(*)
from public.business;

insert into _t
select 'alice cannot read Tenant B', count(*) = 0, 'tenantB rows=' || count(*)
from public.business where id = '22222222-2222-2222-2222-222222222222';

insert into _t
select 'alice sees only her own profile', count(*) = 1 and bool_and(id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), 'profiles visible=' || count(*)
from public.profile;

insert into _t
select 'alice cannot read Bob''s profile', count(*) = 0, 'bob rows=' || count(*)
from public.profile where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

-- Cross-tenant write attempt: update Bob's profile -> RLS blocks (0 rows).
with upd as (
  update public.profile set name = 'hacked' where id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning 1
)
insert into _t select 'alice cannot update Bob', count(*) = 0, 'rows updated=' || count(*) from upd;

-- Privilege-escalation attempt on her OWN row: try to become owner + hop tenants.
-- The freeze trigger must keep role/business_id, allowing only the name change.
with upd as (
  update public.profile
     set role = 'owner', business_id = '22222222-2222-2222-2222-222222222222', name = 'Alice-edited'
   where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
   returning role, business_id, name
)
insert into _t
select 'alice cannot escalate role / hop tenant',
       bool_and(role = 'staff' and business_id = 'f1111111-1111-1111-1111-111111111111' and name = 'Alice-edited'),
       'role/business frozen, name editable'
from upd;

reset role;

-- Return results (as postgres again).
select step, pass, detail from _t order by _t.ctid;

rollback;
