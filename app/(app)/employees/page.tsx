// Employees (SPEC §4.3) — owner/manager only (CLAUDE.md §5). requireRole()
// returns a real 403 for staff (app/forbidden.tsx); the `employee` table is also
// owner/manager-only at the database, so gating is defence-in-depth over RLS.
// The directory streams behind a Suspense boundary after a shape-matched
// skeleton.
//
// The daily-payroll panel (owner-only) reads a pay-day from the URL (?payDate=),
// defaulting to the tenant's current day, so picking a day is server-rendered and
// shareable — same pattern as Reports. The Suspense boundary is keyed on it so it
// re-suspends when the day changes.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import { EmployeesData } from "@/components/employees/employees-data";
import { EmployeesSkeleton } from "@/components/employees/employees-skeleton";
import { isDateStr } from "@/lib/reports/report-params";

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(rolesFor("employees"));

  const sp = await searchParams;
  const payDateParam = first(sp.payDate);
  const payDate = isDateStr(payDateParam)
    ? payDateParam
    : (await resolveTenantPeriod({ kind: "today" })).startDate;

  return (
    <Suspense key={payDate} fallback={<EmployeesSkeleton />}>
      <EmployeesData payDate={payDate} />
    </Suspense>
  );
}
