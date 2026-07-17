-- Migration 022 — DAILY payroll (replaces FN2's monthly salary snapshot)
--
-- Client change: pay is DAILY, approved per day with an optional bonus, and
-- marking a day paid POSTS a Finance expense (category 'Salaries'). The salary
-- payment IS that expense — the two are linked by expense_id so Finance / Reports
-- count payroll EXACTLY ONCE (single source of truth; cash basis, CLAUDE.md §8 /
-- §4 reconciliation). We never add payroll as a second independent total on top
-- of the expense.
--
-- Shape:
--   * employee.salary_cents  → renamed daily_pay_cents (the DAILY rate). Existing
--     monthly values are converted /30 so demo figures read like day wages.
--   * employee.pay_status / paid_at  → DROPPED. Per-period status is no longer a
--     single field on the employee; it now lives per day in salary_payment.
--   * NEW public.salary_payment — one record per (employee, pay_day): a snapshot
--     of the daily rate (base_cents), an optional bonus_cents, the total, a
--     status (pending|paid), who approved it, when it was paid, and the FK to the
--     Finance expense created on approval.
--
-- Money: all *_cents integer, LKR minor units (CLAUDE.md §3). Owner-only at the
-- database (RLS) AND in the server actions (requireRole(['owner'])) — payroll is
-- money, stricter than the owner/manager `employee` table it hangs off.

-- ── employee: monthly salary → daily rate ────────────────────────────────────
alter table public.employee rename column salary_cents to daily_pay_cents;

-- Convert any existing monthly figure to a daily rate (integer cents, no float
-- stored). Rounds to the nearest cent; null (unset) stays null.
update public.employee
  set daily_pay_cents = round(daily_pay_cents / 30.0)
  where daily_pay_cents is not null;

comment on column public.employee.daily_pay_cents is
  'DAILY pay rate in LKR minor units (100ths of a rupee). Null = not configured. Owner-only. Snapshotted into salary_payment.base_cents on approval.';

alter table public.employee drop column pay_status;
alter table public.employee drop column paid_at;

-- ── salary_payment — one pay record per employee per pay-day ──────────────────
create table public.salary_payment (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.business (id) on delete cascade,
  employee_id  uuid not null references public.employee (id) on delete cascade,
  pay_date     date not null,
  base_cents   integer not null check (base_cents >= 0),
  bonus_cents  integer not null default 0 check (bonus_cents >= 0),
  total_cents  integer not null check (total_cents >= 0),
  status       text    not null default 'pending' check (status in ('pending', 'paid')),
  approved_by  uuid references public.profile (id) on delete set null,
  paid_at      timestamptz,
  -- The Finance expense this payment posted. on delete set null so a directly
  -- deleted expense doesn't orphan-block the payment; the app reverses through
  -- reverse_salary_payment (which deletes the expense) to keep them in lockstep.
  expense_id   uuid references public.expense (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- One record per employee per calendar pay-day.
  unique (business_id, employee_id, pay_date),
  -- total is always base + bonus (defence in depth; the RPC computes it).
  constraint salary_payment_total_is_base_plus_bonus
    check (total_cents = base_cents + bonus_cents)
);

comment on table public.salary_payment is
  'Daily payroll record per (employee, pay_date). The linked expense (expense_id) IS the payroll cost for Finance/Reports — never double-counted. Owner-only.';

create index salary_payment_business_idx on public.salary_payment (business_id);
create index salary_payment_employee_idx on public.salary_payment (employee_id);
create index salary_payment_date_idx     on public.salary_payment (business_id, pay_date);
create index salary_payment_expense_idx  on public.salary_payment (expense_id);

-- Tenant stamp on insert; touch updated_at + freeze id/business_id on update
-- (same generic triggers every business table uses).
create trigger salary_payment_set_business_id before insert on public.salary_payment
  for each row execute function private.set_business_id_from_session();
create trigger salary_payment_touch before update on public.salary_payment
  for each row execute function private.touch_and_freeze();

-- ── RLS — owner-only (money), tenant-scoped ──────────────────────────────────
alter table public.salary_payment enable row level security;

create policy "salary_payment: owner access" on public.salary_payment
  for all to authenticated
  using (
    business_id = private.current_business_id()
    and private.current_app_role() = 'owner'
  )
  with check (
    business_id = private.current_business_id()
    and private.current_app_role() = 'owner'
  );

-- ── RPCs — approve / reverse / delete, each atomic across payment + expense ──
-- SECURITY DEFINER (bypasses RLS) so the payment and its linked Salaries expense
-- are written in ONE transaction — a partial failure can never leave a phantom
-- expense inflating Finance, nor a paid record with no expense. Each function
-- RE-CHECKS owner + tenant from the caller's profile (never trusts the client)
-- and pins search_path (CLAUDE.md §7.3).

create or replace function public.approve_salary_payment(
  p_employee_id uuid,
  p_pay_date    date,
  p_bonus_cents integer default 0
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_business uuid;
  v_role     public.app_role;
  v_base     integer;
  v_name     text;
  v_total    integer;
  v_payment  uuid;
  v_expense  uuid;
begin
  select p.business_id, p.role into v_business, v_role
    from public.profile p where p.id = v_uid;
  if v_business is null then raise exception 'no business for caller'; end if;
  if v_role <> 'owner' then raise exception 'forbidden: owner only'; end if;

  if p_bonus_cents is null or p_bonus_cents < 0 then
    raise exception 'invalid bonus';
  end if;

  -- Snapshot the daily rate; employee must be in the caller's tenant and have a
  -- rate set (can't pay an unconfigured employee).
  select e.daily_pay_cents, e.name into v_base, v_name
    from public.employee e
    where e.id = p_employee_id and e.business_id = v_business;
  if v_base is null then
    raise exception 'employee has no daily pay rate';
  end if;

  v_total := v_base + p_bonus_cents;

  select sp.id, sp.expense_id into v_payment, v_expense
    from public.salary_payment sp
    where sp.business_id = v_business
      and sp.employee_id = p_employee_id
      and sp.pay_date = p_pay_date;

  -- The Finance expense — the single source of truth for the payroll cost.
  if v_expense is null then
    insert into public.expense (business_id, date, category, amount_cents, note, created_by)
    values (v_business, p_pay_date, 'Salaries', v_total,
            'Daily salary — ' || v_name, v_uid)
    returning id into v_expense;
  else
    update public.expense
      set amount_cents = v_total, date = p_pay_date, updated_at = now()
      where id = v_expense and business_id = v_business;
  end if;

  if v_payment is null then
    insert into public.salary_payment
      (business_id, employee_id, pay_date, base_cents, bonus_cents, total_cents,
       status, approved_by, paid_at, expense_id)
    values (v_business, p_employee_id, p_pay_date, v_base, p_bonus_cents, v_total,
            'paid', v_uid, now(), v_expense)
    returning id into v_payment;
  else
    update public.salary_payment
      set base_cents = v_base, bonus_cents = p_bonus_cents, total_cents = v_total,
          status = 'paid', approved_by = v_uid, paid_at = now(), expense_id = v_expense
      where id = v_payment;
  end if;

  return v_payment;
end;
$$;

create or replace function public.reverse_salary_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_business uuid;
  v_role     public.app_role;
  v_expense  uuid;
begin
  select p.business_id, p.role into v_business, v_role
    from public.profile p where p.id = v_uid;
  if v_business is null then raise exception 'no business for caller'; end if;
  if v_role <> 'owner' then raise exception 'forbidden: owner only'; end if;

  select sp.expense_id into v_expense
    from public.salary_payment sp
    where sp.id = p_payment_id and sp.business_id = v_business;

  -- Back to pending; drop the links first so deleting the expense can't leave a
  -- paid record pointing at a gone expense.
  update public.salary_payment
    set status = 'pending', approved_by = null, paid_at = null, expense_id = null
    where id = p_payment_id and business_id = v_business;

  if v_expense is not null then
    delete from public.expense where id = v_expense and business_id = v_business;
  end if;
end;
$$;

create or replace function public.delete_salary_payment(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_business uuid;
  v_role     public.app_role;
  v_expense  uuid;
begin
  select p.business_id, p.role into v_business, v_role
    from public.profile p where p.id = v_uid;
  if v_business is null then raise exception 'no business for caller'; end if;
  if v_role <> 'owner' then raise exception 'forbidden: owner only'; end if;

  select sp.expense_id into v_expense
    from public.salary_payment sp
    where sp.id = p_payment_id and sp.business_id = v_business;

  delete from public.salary_payment where id = p_payment_id and business_id = v_business;

  if v_expense is not null then
    delete from public.expense where id = v_expense and business_id = v_business;
  end if;
end;
$$;

revoke all on function public.approve_salary_payment(uuid, date, integer) from public;
revoke all on function public.reverse_salary_payment(uuid) from public;
revoke all on function public.delete_salary_payment(uuid) from public;
grant execute on function public.approve_salary_payment(uuid, date, integer) to authenticated;
grant execute on function public.reverse_salary_payment(uuid) to authenticated;
grant execute on function public.delete_salary_payment(uuid) to authenticated;
