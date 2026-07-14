-- Migration 011 — lightweight salary tracking on employee (demo scope, SPEC §4.3)
--
-- Adds three columns to public.employee:
--   salary_cents  monthly salary in LKR minor units (null = not configured)
--   pay_status    current-period status: 'paid' | 'pending' | 'not_set'
--   paid_at       timestamp when status was last set to 'paid' (cleared on revert)
--
-- No new table: per-period history is out of scope for the demo. The existing
-- "employee: owner/manager access" (FOR ALL) policy already covers UPDATE, so
-- tenant isolation is inherited. Salary mutations are additionally gated
-- owner-only in the server action via requireRole(["owner"]) — never trusted from
-- the client.

alter table public.employee
  add column salary_cents integer
    check (salary_cents is null or salary_cents >= 0),
  add column pay_status   text not null default 'not_set'
    check (pay_status in ('paid', 'pending', 'not_set')),
  add column paid_at      timestamptz;

comment on column public.employee.salary_cents is
  'Monthly salary in LKR minor units (100ths of a rupee). Null = not yet configured. Owner-only.';
comment on column public.employee.pay_status is
  'Current-period pay status: paid | pending | not_set. Owner-only field.';
comment on column public.employee.paid_at is
  'Timestamp when pay_status was set to ''paid'' for this period; cleared on revert.';
