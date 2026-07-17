// queries/salary.ts — raw, tenant-scoped reads of the daily-payroll ledger
// (salary_payment). RLS restricts these to the OWNER of the tenant (payroll is
// money, owner-only), so there is no money leak to manager/staff here. No
// derivation — see selectors/employees.ts (payroll day) and selectors/salaries.ts
// (the Salaries report). CLAUDE.md §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";

export type SalaryPaymentRow = Database["public"]["Tables"]["salary_payment"]["Row"];

/** A pay record joined to its employee's name/title (for the Salaries report). */
export type SalaryPaymentWithEmployee = SalaryPaymentRow & {
  employee: { name: string; role: string | null } | null;
};

/** Pay records for a single pay-day (the payroll approve/pay panel). */
export async function listSalaryPaymentsByDate(payDate: string): Promise<SalaryPaymentRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_payment")
    .select("*")
    .eq("pay_date", payDate);
  if (error) throw error;
  return data ?? [];
}

/**
 * Pay records whose `pay_date` falls in the period's inclusive local calendar
 * bounds (a plain `date` column, like expense.date). Each carries its employee's
 * name so the report can group by person. Ordered by pay_date then employee.
 */
export async function listSalaryPaymentsInPeriod(
  period: Period,
): Promise<SalaryPaymentWithEmployee[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("salary_payment")
    .select("*, employee:employee_id(name, role)")
    .gte("pay_date", period.startDate)
    .lte("pay_date", period.endDate)
    .order("pay_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SalaryPaymentWithEmployee[];
}
