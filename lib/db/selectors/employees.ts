// selectors/employees.ts — the Employees screen's derived, render-ready list
// (SPEC §4.3, read-focused). Shapes raw employee rows into typed items: the
// job title, the parsed permission set, the ordered shift days, and whether the
// row is linked to a login account (profile_id). No formatting here.

import "server-only";
import { cache } from "react";
import { listEmployees } from "@/lib/db/queries/employees";
import { parsePermissions, parseShiftSchedule, type ShiftDay } from "@/lib/employees/employee-config";

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
};

export type EmployeeList = {
  items: EmployeeListItem[];
};

async function loadEmployeeList(): Promise<EmployeeList> {
  const rows = await listEmployees();

  const items: EmployeeListItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    role: r.role,
    permissions: parsePermissions(r.permissions),
    shift: parseShiftSchedule(r.shift_schedule),
    hasLogin: r.profile_id !== null,
  }));

  return { items };
}

/** The Employees list for this tenant. React-`cache()`d per request. */
export const getEmployeeList = cache((): Promise<EmployeeList> => loadEmployeeList());
