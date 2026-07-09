// Route-level loading UI (DESIGN.md §6): shown while the Employees payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { EmployeesSkeleton } from "@/components/employees/employees-skeleton";

export default function EmployeesLoading() {
  return <EmployeesSkeleton />;
}
