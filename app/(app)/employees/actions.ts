"use server";

// Employees server actions. Salary mutations are owner-only.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markEmployeePaidSchema } from "@/lib/zod/employees";

export type EmployeePayActionState = { ok?: boolean; error?: string };

export async function markEmployeePaid(
  employeeId: string,
  paid: boolean,
): Promise<EmployeePayActionState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.payroll.error" };

  const parsed = markEmployeePaidSchema.safeParse({ employeeId, paid });
  if (!parsed.success) return { error: "employees.payroll.error" };

  const supabase = await createClient();

  const { error } = await supabase
    .from("employee")
    .update({
      pay_status: paid ? "paid" : "pending",
      paid_at: paid ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.employeeId)
    .eq("business_id", profile.business_id);

  if (error) return { error: "employees.payroll.error" };

  revalidatePath("/employees");
  return { ok: true };
}
