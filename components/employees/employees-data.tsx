import {
  getEmployeeList,
  getLinkableAccounts,
  getPayrollDay,
} from "@/lib/db/selectors/employees";
import { EmployeesList } from "@/components/employees/employees-list";

export async function EmployeesData({ payDate }: { payDate: string }) {
  const [items, linkableAccounts, payrollDay] = await Promise.all([
    getEmployeeList(),
    getLinkableAccounts(),
    getPayrollDay(payDate),
  ]);
  return (
    <EmployeesList
      items={items}
      linkableAccounts={linkableAccounts}
      payrollDay={payrollDay}
    />
  );
}
