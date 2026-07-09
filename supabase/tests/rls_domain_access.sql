-- Per-role RLS access test for the domain schema (CLAUDE.md §5 matrix, §7).
--
-- Transaction-scoped + ROLLBACK: safe to run anywhere, leaves no data.
-- Seeds two tenants and, in tenant A, three users (owner/manager/staff) plus an
-- owner in tenant B, then asserts the access matrix and tenant isolation.
--
-- Synthetic UUIDs (f1111111…, 22222222…, a0/a1/a2/b0…) are chosen to NOT collide
-- with seed rows; per-role reads are RLS-scoped to the test tenant, so this runs
-- cleanly against the live seeded demo DB as well as a fresh reset.
--
-- Run: supabase db query --linked -f supabase/tests/rls_domain_access.sql
-- Every row should read pass = true.

begin;

create temp table _t (step text, pass boolean, detail text) on commit drop;
grant insert, select on _t to authenticated;

-- Tenants
insert into public.business (id, name) values
  ('f1111111-1111-1111-1111-111111111111', 'Tenant A'),
  ('22222222-2222-2222-2222-222222222222', 'Tenant B');

-- Users (app_metadata drives the on-signup trigger -> profile role/business_id)
insert into auth.users (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('a0000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@a.test',
     '{"business_id":"f1111111-1111-1111-1111-111111111111","role":"owner"}','{"name":"A-Owner"}', now(), now()),
  ('a1111111-1111-1111-1111-111111111111','authenticated','authenticated','manager@a.test',
     '{"business_id":"f1111111-1111-1111-1111-111111111111","role":"manager"}','{"name":"A-Manager"}', now(), now()),
  ('a2222222-2222-2222-2222-222222222222','authenticated','authenticated','staff@a.test',
     '{"business_id":"f1111111-1111-1111-1111-111111111111","role":"staff"}','{"name":"A-Staff"}', now(), now()),
  ('b0000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@b.test',
     '{"business_id":"22222222-2222-2222-2222-222222222222","role":"owner"}','{"name":"B-Owner"}', now(), now());

-- Seed data as admin (RLS bypassed). business_id kept as given (auth.uid() null).
insert into public.customer (id, business_id, name) values
  ('c0000000-0000-0000-0000-00000000000a','f1111111-1111-1111-1111-111111111111','A Cust'),
  ('c0000000-0000-0000-0000-00000000000b','22222222-2222-2222-2222-222222222222','B Cust');
insert into public.menu_item (business_id, name, price_cents) values
  ('f1111111-1111-1111-1111-111111111111','Flat White', 65000);
insert into public.expense (business_id, category, amount_cents) values
  ('f1111111-1111-1111-1111-111111111111','rent', 25000000),
  ('22222222-2222-2222-2222-222222222222','rent', 30000000);
insert into public.commission_rule (business_id, source, rate_bps) values
  ('f1111111-1111-1111-1111-111111111111','pickme_food', 1500);
insert into public.employee (business_id, name, role) values
  ('f1111111-1111-1111-1111-111111111111','Nimal','Baker');

-- ===== Act as STAFF (tenant A) ============================================
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"a2222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

insert into _t select 'staff CAN read customer (own tenant)', count(*) = 1, 'rows=' || count(*)
  from public.customer;
insert into _t select 'staff CAN read menu_item', count(*) = 1, 'rows=' || count(*)
  from public.menu_item;
insert into _t select 'staff CANNOT read expense', count(*) = 0, 'rows=' || count(*)
  from public.expense;
insert into _t select 'staff CANNOT read commission_rule', count(*) = 0, 'rows=' || count(*)
  from public.commission_rule;
insert into _t select 'staff CANNOT read employee', count(*) = 0, 'rows=' || count(*)
  from public.employee;
insert into _t select 'staff CANNOT see Tenant B customer', count(*) = 0, 'rows=' || count(*)
  from public.customer where id = 'c0000000-0000-0000-0000-00000000000b';

-- business_id is stamped from session on insert: staff tries to plant a row in
-- Tenant B; the trigger rewrites it to Tenant A (else WITH CHECK would reject).
with ins as (
  insert into public.customer (business_id, name)
  values ('22222222-2222-2222-2222-222222222222', 'stamp-test')
  returning business_id, id
)
insert into _t select 'insert stamps business_id from session (not client)',
  business_id = 'f1111111-1111-1111-1111-111111111111', 'stamped=' || business_id
  from ins;

-- freeze on update: staff tries to move their own customer to Tenant B.
with upd as (
  update public.customer set business_id = '22222222-2222-2222-2222-222222222222', name = 'renamed'
  where id = 'c0000000-0000-0000-0000-00000000000a'
  returning business_id, name
)
insert into _t select 'update freezes business_id (name still editable)',
  business_id = 'f1111111-1111-1111-1111-111111111111' and name = 'renamed',
  'business=' || business_id
  from upd;

-- ===== Act as MANAGER (tenant A) ==========================================
select set_config('request.jwt.claims',
  '{"sub":"a1111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

insert into _t select 'manager CAN read expense', count(*) = 1, 'rows=' || count(*)
  from public.expense;
insert into _t select 'manager CAN read commission_rule', count(*) = 1, 'rows=' || count(*)
  from public.commission_rule;
insert into _t select 'manager CAN read employee', count(*) = 1, 'rows=' || count(*)
  from public.employee;
insert into _t select 'manager CANNOT see Tenant B expense', count(*) = 0, 'rows=' || count(*)
  from public.expense where business_id = '22222222-2222-2222-2222-222222222222';

-- ===== Act as OWNER (tenant A) ============================================
select set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000000","role":"authenticated"}', true);

insert into _t select 'owner CAN read expense', count(*) = 1, 'rows=' || count(*)
  from public.expense;
insert into _t select 'owner CAN read employee', count(*) = 1, 'rows=' || count(*)
  from public.employee;

reset role;
select step, pass, detail from _t order by _t.ctid;

rollback;
