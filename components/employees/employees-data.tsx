import { getEmployeeList, getLinkableAccounts } from "@/lib/db/selectors/employees";
import { EmployeesList } from "@/components/employees/employees-list";

export async function EmployeesData() {
  const [{ items, payroll }, linkableAccounts] = await Promise.all([
    getEmployeeList(),
    getLinkableAccounts(),
  ]);
  return <EmployeesList items={items} payroll={payroll} linkableAccounts={linkableAccounts} />;
}
