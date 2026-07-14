import { getEmployeeList, getUnlinkedProfiles } from "@/lib/db/selectors/employees";
import { EmployeesList } from "@/components/employees/employees-list";

export async function EmployeesData() {
  const [{ items, payroll }, unlinkedProfiles] = await Promise.all([
    getEmployeeList(),
    getUnlinkedProfiles(),
  ]);
  return <EmployeesList items={items} payroll={payroll} unlinkedProfiles={unlinkedProfiles} />;
}
