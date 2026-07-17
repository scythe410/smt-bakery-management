// selectors/employees.ts — the Employees screen's derived, render-ready data
// (SPEC §4.3). Two selectors:
//   * getEmployeeList  — the staff directory: job title, permissions, ordered
//     shift days, login-account flag, and the DAILY pay rate (owner-only money).
//   * getPayrollDay    — the daily-payroll panel for ONE pay-day: each employee
//     with a rate + their pay record for that day (paid | pending), plus the FN2
//     status-bar totals. Owner-only; RLS returns no salary_payment rows to a
//     manager, so nothing money leaks even if this is called for them.

import "server-only";
import { cache } from "react";
import { listEmployees, listLinkableAccounts, type LinkableAccount } from "@/lib/db/queries/employees";
import { listSalaryPaymentsByDate } from "@/lib/db/queries/salary";
import { parsePermissions, parseShiftSchedule, type ShiftDay } from "@/lib/employees/employee-config";

export type { LinkableAccount };

/** A pay record's status. Daily payroll is a per-day paid|pending state. */
export type PayStatus = "paid" | "pending";

export type EmployeeListItem = {
  id: string;
  name: string;
  /** Free-text job title (e.g. "Head Baker"), or null when unset. */
  role: string | null;
  /** Granted permission keys; ["all"] means full access. */
  permissions: string[];
  /** Days worked, ordered Mon→Sun, each with its "HH:MM-HH:MM" hours. */
  shift: ShiftDay[];
  /** True when this employee is linked to a login account (profile_id set). */
  hasLogin: boolean;
  /** The linked login account's profile id, or null when HR-record only. */
  profileId: string | null;
  /** DAILY pay rate in LKR minor units, or null when not configured. */
  dailyPayCents: number | null;
};

async function loadEmployeeList(): Promise<EmployeeListItem[]> {
  const rows = await listEmployees();
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    permissions: parsePermissions(r.permissions),
    shift: parseShiftSchedule(r.shift_schedule),
    hasLogin: r.profile_id !== null,
    profileId: r.profile_id,
    dailyPayCents: r.daily_pay_cents ?? null,
  }));
}

/** The Employees staff directory for this tenant. React-`cache()`d per request. */
export const getEmployeeList = cache((): Promise<EmployeeListItem[]> => loadEmployeeList());

/** Login accounts an owner may link to an employee. React-`cache()`d per request. */
export const getLinkableAccounts = cache((): Promise<LinkableAccount[]> => listLinkableAccounts());

// ── Daily payroll: one pay-day ───────────────────────────────────────────────

export type PayrollDayEmployee = {
  employeeId: string;
  name: string;
  role: string | null;
  /** null → no rate set; the employee can't be paid until one is configured. */
  dailyPayCents: number | null;
  /** The pay record for THIS day, or null when not yet approved. */
  payment: {
    id: string;
    baseCents: number;
    bonusCents: number;
    totalCents: number;
    status: PayStatus;
    paidAt: string | null;
  } | null;
};

/** The daily-payroll panel model + FN2 status-bar totals for one pay-day. */
export type PayrollDay = {
  payDate: string;
  /** Every employee, whether or not they have a rate (the panel filters). */
  rows: PayrollDayEmployee[];
  /** Σ total_cents of PAID records this day (equals the day's Salaries expenses). */
  totalPaidCents: number;
  /** Employees paid for this day. */
  paidCount: number;
  /** Employees with a rate not yet paid for this day. */
  pendingCount: number;
  /** Employees with a daily rate configured (paid + pending). */
  employeesWithRate: number;
};

async function loadPayrollDay(payDate: string): Promise<PayrollDay> {
  const [employees, payments] = await Promise.all([
    listEmployees(),
    listSalaryPaymentsByDate(payDate),
  ]);

  const payByEmp = new Map(payments.map((p) => [p.employee_id, p]));

  const rows: PayrollDayEmployee[] = employees.map((e) => {
    const p = payByEmp.get(e.id);
    return {
      employeeId: e.id,
      name: e.name,
      role: e.role,
      dailyPayCents: e.daily_pay_cents ?? null,
      payment: p
        ? {
            id: p.id,
            baseCents: p.base_cents,
            bonusCents: p.bonus_cents,
            totalCents: p.total_cents,
            status: p.status === "paid" ? "paid" : "pending",
            paidAt: p.paid_at,
          }
        : null,
    };
  });

  let totalPaidCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let employeesWithRate = 0;
  for (const r of rows) {
    if (r.dailyPayCents === null) continue;
    employeesWithRate++;
    if (r.payment && r.payment.status === "paid") {
      paidCount++;
      totalPaidCents += r.payment.totalCents;
    } else {
      pendingCount++;
    }
  }

  return { payDate, rows, totalPaidCents, paidCount, pendingCount, employeesWithRate };
}

/** The daily-payroll panel + status-bar totals for one pay-day. Per-request cache. */
export const getPayrollDay = cache((payDate: string): Promise<PayrollDay> => loadPayrollDay(payDate));
