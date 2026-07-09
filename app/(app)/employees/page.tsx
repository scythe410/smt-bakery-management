// Employees (SPEC §4.3) — owner/manager only (CLAUDE.md §5). requireRole()
// returns a real 403 for staff (app/forbidden.tsx); the `employee` table is also
// owner/manager-only at the database, so gating is defence-in-depth over RLS.
// The directory streams behind a Suspense boundary after a shape-matched
// skeleton. Read-focused baseline: a staff directory with roles/permissions and
// shift schedule; payroll/attendance are out of scope pending confirmation.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { EmployeesData } from "@/components/employees/employees-data";
import { EmployeesSkeleton } from "@/components/employees/employees-skeleton";

export default async function EmployeesPage() {
  await requireRole(rolesFor("employees"));

  return (
    <Suspense fallback={<EmployeesSkeleton />}>
      <EmployeesData />
    </Suspense>
  );
}
