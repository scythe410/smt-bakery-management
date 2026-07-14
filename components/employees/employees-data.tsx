// Async server component: fetches the tenant's employee list (RLS-scoped +
// owner/manager-only at the DB) and hands list + payroll summary to the client
// directory. Rendered inside a Suspense boundary so the skeleton streams first
// (DESIGN.md §6).

import { getEmployeeList } from "@/lib/db/selectors/employees";
import { EmployeesList } from "@/components/employees/employees-list";

export async function EmployeesData() {
  const { items, payroll } = await getEmployeeList();
  return <EmployeesList items={items} payroll={payroll} />;
}
