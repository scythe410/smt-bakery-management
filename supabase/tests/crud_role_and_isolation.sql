-- ===========================================================================
-- Tenant isolation + role gating + employee/account decoupling.
-- Second tenant (B2) is built inside the txn (exercises the signup trigger).
-- Everything rolled back. Impersonation switches by rewriting jwt claims.
--
-- Run: supabase db query --linked -o csv -f supabase/tests/crud_role_and_isolation.sql
-- Every row should read result = PASS. Covers: staff denied finance/employee,
-- manager allowed, cross-tenant read/update/delete/inject all blocked, and
-- deleting an employee does NOT delete its linked login/profile.
-- ===========================================================================
begin;
create temp table _r(entity text, scenario text, expected text, pass boolean, detail text,
  at timestamptz not null default clock_timestamp()) on commit drop;
create temp table _ids(k text primary key, v uuid) on commit drop;
grant all on _r to authenticated;
grant all on _ids to authenticated;

-- Second tenant + its owner (signup trigger provisions the B2 profile), and B1
-- probe rows. All seeded as the privileged role (explicit business_id kept).
do $$
declare v uuid;
begin
  insert into public.business(id,name) values('22222222-2222-2222-2222-222222222222','Rival Bakery');
  insert into auth.users(id,email,raw_app_meta_data,raw_user_meta_data)
  values('bbbbbbbb-0000-0000-0000-000000000001','owner@rival.demo',
    '{"business_id":"22222222-2222-2222-2222-222222222222","role":"owner"}'::jsonb,'{"name":"Rival Owner"}'::jsonb);

  insert into public.customer(business_id,name) values('11111111-1111-1111-1111-111111111111','XT Cust') returning id into v;
  insert into _ids values('b1_customer', v);
  insert into public.menu_item(business_id,name,price_cents) values('11111111-1111-1111-1111-111111111111','XT Menu',1000) returning id into v;
  insert into _ids values('b1_menu', v);
  insert into public.expense(business_id,category,amount_cents) values('11111111-1111-1111-1111-111111111111','xt-probe',100);
  insert into public.employee(business_id,name) values('11111111-1111-1111-1111-111111111111','XT Emp');
  insert into public.commission_rule(business_id,source,rate_bps) values('11111111-1111-1111-1111-111111111111','uber_eats',100);
end $$;

-- ---------------------------------------------------- role gating: STAFF (denied)
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;
do $$
declare c int; ok boolean;
begin
  select count(*) into c from public.expense;
  insert into _r values('role:staff','SELECT expense','0 rows (no policy)',c=0,'visible='||c);
  select count(*) into c from public.employee;
  insert into _r values('role:staff','SELECT employee','0 rows (no policy)',c=0,'visible='||c);
  select count(*) into c from public.commission_rule;
  insert into _r values('role:staff','SELECT commission_rule','0 rows (no policy)',c=0,'visible='||c);
  begin
    insert into public.expense(business_id,category,amount_cents) values('11111111-1111-1111-1111-111111111111','staff-try',100);
    insert into _r values('role:staff','INSERT expense','denied (RLS WITH CHECK)',false,'ACCEPTED (should not)');
  exception when others then
    insert into _r values('role:staff','INSERT expense','denied (RLS WITH CHECK)',true,left(sqlerrm,45));
  end;
  -- staff CAN access operational tables (inventory/menu/orders/bookings)
  begin
    perform 1 from public.menu_item limit 1;
    insert into public.inventory_item(business_id,name,kind,unit) values('11111111-1111-1111-1111-111111111111','staff-inv','ingredient','g');
    insert into _r values('role:staff','operational access (inventory)','allowed',true,'staff created inventory_item ok');
  exception when others then
    insert into _r values('role:staff','operational access (inventory)','allowed',false,'ERR '||sqlerrm);
  end;
end $$;
reset role;

-- --------------------------------------------------- role gating: MANAGER (allowed)
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000002","role":"authenticated"}', true);
set local role authenticated;
do $$
declare c int;
begin
  select count(*) into c from public.expense;
  insert into _r values('role:manager','SELECT expense','>=1 (owner/manager)',c>=1,'visible='||c);
  select count(*) into c from public.employee;
  insert into _r values('role:manager','SELECT employee','>=1',c>=1,'visible='||c);
  begin
    insert into public.expense(business_id,category,amount_cents) values('11111111-1111-1111-1111-111111111111','mgr-ok',500);
    insert into _r values('role:manager','INSERT expense','allowed',true,'manager created expense ok');
  exception when others then
    insert into _r values('role:manager','INSERT expense','allowed',false,'ERR '||sqlerrm);
  end;
end $$;
reset role;

-- --------------------------------------------------- cross-tenant: B2 owner vs B1
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare v_b1cust uuid; v_b1menu uuid; c int; n int; v_bid uuid;
begin
  select v into v_b1cust from _ids where k='b1_customer';
  select v into v_b1menu from _ids where k='b1_menu';
  -- cannot see B1 rows
  select count(*) into c from public.customer where id=v_b1cust;
  insert into _r values('cross-tenant','B2 SELECT B1 customer','invisible (0)',c=0,'rows='||c);
  select count(*) into c from public.menu_item where id=v_b1menu;
  insert into _r values('cross-tenant','B2 SELECT B1 menu_item','invisible (0)',c=0,'rows='||c);
  -- cannot update B1
  update public.customer set name='hijack' where id=v_b1cust;
  get diagnostics n = row_count;
  insert into _r values('cross-tenant','B2 UPDATE B1 customer','0 rows',n=0,'rows='||n);
  -- cannot delete B1
  delete from public.customer where id=v_b1cust;
  get diagnostics n = row_count;
  insert into _r values('cross-tenant','B2 DELETE B1 customer','0 rows',n=0,'rows='||n);
  -- cannot inject into B1: business_id gets stamped to B2
  insert into public.customer(business_id,name) values('11111111-1111-1111-1111-111111111111','inject') returning business_id into v_bid;
  insert into _r values('cross-tenant','B2 INSERT w/ business_id=B1','stamped back to B2',
    v_bid='22222222-2222-2222-2222-222222222222','landed in '||v_bid);
end $$;
reset role;

-- ------------------------------ employee delete does NOT cascade to login/profile
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;
do $$
declare e uuid;
begin
  insert into public.employee(business_id,name,profile_id) values('11111111-1111-1111-1111-111111111111','Link Emp','aaaaaaaa-0000-0000-0000-000000000003') returning id into e;
  delete from public.employee where id=e;
  insert into _r values('employee','delete linked HR record','employee row gone',not exists(select 1 from public.employee where id=e),'deleted');
end $$;
reset role;
-- privileged read: the linked login + profile survive
insert into _r values('employee','linked account retained after delete','auth.users + profile intact',
  (exists(select 1 from auth.users where id='aaaaaaaa-0000-0000-0000-000000000003')
   and exists(select 1 from public.profile where id='aaaaaaaa-0000-0000-0000-000000000003')),
  'staff@ login + profile still exist; account freed for re-linking');

select entity, scenario, expected, case when pass then 'PASS' else 'FAIL' end as result, detail
from _r order by at;
rollback;
