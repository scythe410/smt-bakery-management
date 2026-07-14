// selectors/employees.ts — the Employees screen's derived, render-ready list
// (SPEC §4.3). Shapes raw employee rows into typed items: job title, parsed
// permission set, ordered shift days, login-account flag, and salary/pay status
// (owner-only money fields). Also computes the payroll summary bar totals.

import "server-only";
import { cache } from "react";
import { listEmployees, listUnlinkedProfiles, type ProfileOption } from "@/lib/db/queries/employees";
import { parsePermissions, parseShiftSchedule, type ShiftDay } from "@/lib/employees/employee-config";

export type { ProfileOption };

export type PayStatus = "paid" | "pending" | "not_set";

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
  /** Monthly salary in LKR minor units, or null when not configured. */
  salaryCents: number | null;
  /** Current-period pay status. */
  payStatus: PayStatus;
  /** When pay_status was last set to 'paid'; null otherwise. */
  paidAt: string | null;
};

/** Aggregated payroll summary for the status bar (owner-only). */
export type PayrollSummary = {
  /** Sum of salary_cents for employees with a salary set (any status). */
  totalCents: number;
  /** Count of employees with pay_status = 'paid'. */
  paidCount: number;
  /** Count of employees with pay_status = 'pending'. */
  pendingCount: number;
  /** Employees with a salary configured (paid + pending). */
  employeesWithSalary: number;
};

export type EmployeeList = {
  items: EmployeeListItem[];
  payroll: PayrollSummary;
};

function toPayStatus(raw: string): PayStatus {
  if (raw === "paid" || raw === "pending" || raw === "not_set") return raw;
  return "not_set";
}

async function loadEmployeeList(): Promise<EmployeeList> {
  const rows = await listEmployees();

  const items: EmployeeListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    permissions: parsePermissions(r.permissions),
    shift: parseShiftSchedule(r.shift_schedule),
    hasLogin: r.profile_id !== null,
    salaryCents: r.salary_cents ?? null,
    payStatus: toPayStatus(r.pay_status),
    paidAt: r.paid_at ?? null,
  }));

  // Build payroll summary from items.
  let totalCents = 0;
  let paidCount = 0;
  let pendingCount = 0;
  for (const item of items) {
    if (item.salaryCents !== null) {
      totalCents += item.salaryCents;
      if (item.payStatus === "paid") paidCount++;
      else if (item.payStatus === "pending") pendingCount++;
    }
  }

  return {
    items,
    payroll: { totalCents, paidCount, pendingCount, employeesWithSalary: paidCount + pendingCount },
  };
}

/** The Employees list + payroll summary for this tenant. React-`cache()`d per request. */
export const getEmployeeList = cache((): Promise<EmployeeList> => loadEmployeeList());

/** Profiles not yet linked to an employee record. React-`cache()`d per request. */
export const getUnlinkedProfiles = cache((): Promise<ProfileOption[]> => listUnlinkedProfiles());
