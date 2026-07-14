"use server";

// Employees server actions. All mutations are owner-only.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { markEmployeePaidSchema, upsertEmployeeSchema, deleteEmployeeSchema } from "@/lib/zod/employees";
import { insertEmployee, updateEmployee, removeEmployee } from "@/lib/db/queries/employees";
import { WEEKDAYS } from "@/lib/employees/employee-config";

export type EmployeePayActionState = { ok?: boolean; error?: string };
export type EmpFormState = { ok?: boolean; error?: string };

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

function parseFormData(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null)?.trim() || undefined;
  const salaryRaw = (formData.get("salary_lkr") as string | null)?.trim();
  const salaryCents =
    salaryRaw && salaryRaw !== "" ? Math.round(parseInt(salaryRaw, 10) * 100) : null;
  const profileIdRaw = (formData.get("profile_id") as string | null)?.trim();
  const profileId = profileIdRaw && profileIdRaw !== "" ? profileIdRaw : null;

  const PERM_KEYS = ["all", "orders", "inventory", "menu", "bookings", "reports", "finance", "settings"] as const;
  const permissions: Record<string, boolean> = {};
  if (formData.get("perm_all") === "on") {
    permissions.all = true;
  } else {
    for (const key of PERM_KEYS.slice(1)) {
      if (formData.get(`perm_${key}`) === "on") permissions[key] = true;
    }
  }

  const shift: Record<string, string> = {};
  for (const day of WEEKDAYS) {
    if (formData.get(`shift_${day}`) === "on") {
      const hours = (formData.get(`shift_${day}_hours`) as string | null)?.trim();
      if (hours) shift[day] = hours;
    }
  }

  return { name, role, salaryCents, profileId, permissions, shift };
}

export async function createEmployee(
  _prevState: EmpFormState,
  formData: FormData,
): Promise<EmpFormState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.form.errorGeneric" };

  const raw = parseFormData(formData);
  const parsed = upsertEmployeeSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    if (firstIssue?.path[0] === "name") return { error: "employees.form.errorRequired" };
    return { error: "employees.form.errorGeneric" };
  }

  try {
    await insertEmployee(profile.business_id, parsed.data);
  } catch {
    return { error: "employees.form.errorGeneric" };
  }

  revalidatePath("/employees");
  return { ok: true };
}

export async function editEmployee(
  employeeId: string,
  _prevState: EmpFormState,
  formData: FormData,
): Promise<EmpFormState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.form.errorGeneric" };

  const parsed = deleteEmployeeSchema.safeParse({ employeeId });
  if (!parsed.success) return { error: "employees.form.errorGeneric" };

  const raw = parseFormData(formData);
  const dataParsed = upsertEmployeeSchema.safeParse(raw);
  if (!dataParsed.success) {
    const firstIssue = dataParsed.error.issues[0];
    if (firstIssue?.path[0] === "name") return { error: "employees.form.errorRequired" };
    return { error: "employees.form.errorGeneric" };
  }

  try {
    await updateEmployee(parsed.data.employeeId, profile.business_id, dataParsed.data);
  } catch {
    return { error: "employees.form.errorGeneric" };
  }

  revalidatePath("/employees");
  return { ok: true };
}

export async function deleteEmployee(employeeId: string): Promise<{ ok?: boolean; error?: string }> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.deleteError" };

  const parsed = deleteEmployeeSchema.safeParse({ employeeId });
  if (!parsed.success) return { error: "employees.deleteError" };

  try {
    await removeEmployee(parsed.data.employeeId, profile.business_id);
  } catch {
    return { error: "employees.deleteError" };
  }

  revalidatePath("/employees");
  return { ok: true };
}
