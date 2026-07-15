-- rls_staff_expense.sql — coverage for migration 017 (staff may record + view
-- expenses, nothing else on money; SPEC §3.2 / CLAUDE.md §5, CF5). Run against
-- the LINKED project, wrapped in BEGIN … ROLLBACK so nothing persists (blank
-- handoff must stay blank). Each check RAISEs on failure ⇒ a clean run = pass:
--
--   supabase db query --linked --file supabase/tests/rls_staff_expense.sql
--
-- Auth uids (from seed): owner@ aaaaaaaa-…0001, staff@ aaaaaaaa-…0003.
-- Business 11111111-…1111.

begin;

-- ---- OWNER seeds a commission_rule + an owner-created expense ------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}', true);
set local role authenticated;

insert into public.commission_rule (business_id, source, rate_bps)
values ('11111111-1111-1111-1111-111111111111', 'dine_in', 500);

insert into public.expense (id, business_id, date, category, amount_cents, note, created_by)
values ('dddddddd-0000-0000-0000-0000000000e1','11111111-1111-1111-1111-111111111111',
        current_date, 'Owner Cost', 250000, 'owner row', 'aaaaaaaa-0000-0000-0000-000000000001');

-- ---- Impersonate STAFF --------------------------------------------------
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-0000-0000-0000-000000000003","role":"authenticated"}', true);
set local role authenticated;

-- T1 — staff INSERTs its own expense for the tenant.
do $$
begin
  insert into public.expense (id, business_id, date, category, amount_cents, note, created_by)
  values ('dddddddd-0000-0000-0000-0000000000e2','11111111-1111-1111-1111-111111111111',
          current_date, 'Staff Cost', 40000, 'staff row', 'aaaaaaaa-0000-0000-0000-000000000003');
exception when others then
  raise exception 'FAIL T1: staff could not insert an expense (%)', sqlerrm;
end $$;

-- T2 — staff SELECTs the tenant ledger: sees BOTH rows (its own + the owner's).
do $$
declare n int;
begin
  select count(*) into n from public.expense
   where business_id = '11111111-1111-1111-1111-111111111111'
     and id in ('dddddddd-0000-0000-0000-0000000000e1','dddddddd-0000-0000-0000-0000000000e2');
  if n <> 2 then raise exception 'FAIL T2: staff sees % of 2 tenant expenses', n; end if;
end $$;

-- T3 — staff UPDATEs its OWN row (1 row affected).
do $$
declare c int;
begin
  update public.expense set amount_cents = 45000 where id = 'dddddddd-0000-0000-0000-0000000000e2';
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'FAIL T3: staff update-own affected % rows', c; end if;
end $$;

-- T4 — staff CANNOT update the OWNER's row (0 rows affected — not visible to the
-- write policy, which requires created_by = self).
do $$
declare c int;
begin
  update public.expense set amount_cents = 1 where id = 'dddddddd-0000-0000-0000-0000000000e1';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'FAIL T4: staff updated an owner-created expense (% rows)', c; end if;
end $$;

-- T5 — staff CANNOT delete the OWNER's row (0 rows affected).
do $$
declare c int;
begin
  delete from public.expense where id = 'dddddddd-0000-0000-0000-0000000000e1';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'FAIL T5: staff deleted an owner-created expense (% rows)', c; end if;
end $$;

-- T6 — staff CAN delete its OWN row (1 row affected).
do $$
declare c int;
begin
  delete from public.expense where id = 'dddddddd-0000-0000-0000-0000000000e2';
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'FAIL T6: staff delete-own affected % rows', c; end if;
end $$;

-- T7 — the money boundary holds: staff CANNOT read commission_rule (the source of
-- net revenue / platform earnings). RLS returns 0 rows despite one existing.
do $$
declare n int;
begin
  select count(*) into n from public.commission_rule
   where business_id = '11111111-1111-1111-1111-111111111111';
  if n <> 0 then raise exception 'FAIL T7: staff can read commission_rule (% rows)', n; end if;
end $$;

-- T8 — no cross-tenant write: a client-supplied business_id is IGNORED. The
-- set_business_id_from_session BEFORE INSERT trigger stamps the caller's own
-- tenant (CLAUDE.md §7.3), so an expense aimed at another business lands in the
-- staff's own tenant — never the target's.
do $$
declare v_biz uuid;
begin
  insert into public.expense (id, business_id, date, category, amount_cents, created_by)
  values ('dddddddd-0000-0000-0000-0000000000e3','22222222-2222-2222-2222-222222222222',
          current_date, 'X', 100, 'aaaaaaaa-0000-0000-0000-000000000003');
  select business_id into v_biz from public.expense where id = 'dddddddd-0000-0000-0000-0000000000e3';
  if v_biz <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'FAIL T8: client business_id not coerced to caller tenant (got %)', v_biz;
  end if;
end $$;

select 'rls_staff_expense: ALL CHECKS PASSED' as result;

rollback;
