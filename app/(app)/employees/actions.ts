"use server";

// Employees server actions. All mutations are owner-only.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { upsertEmployeeSchema, deleteEmployeeSchema } from "@/lib/zod/employees";
import { approveSalarySchema, salaryPaymentIdSchema } from "@/lib/zod/salary";
import { insertEmployee, updateEmployee, removeEmployee } from "@/lib/db/queries/employees";
import { WEEKDAYS } from "@/lib/employees/employee-config";

export type EmployeePayActionState = { ok?: boolean; error?: string };
export type EmpFormState = { ok?: boolean; error?: string };

// Approving a day's pay creates a linked 'Salaries' expense, so it touches both
// the Employees payroll view and the Finance/Expenses surfaces. Revalidate all
// three plus the `expenses` data-cache tag (Dashboard/Finance/Reports totals).
function revalidatePayrollSurfaces(businessId: string) {
  revalidatePath("/employees");
  revalidatePath("/finance");
  revalidatePath("/expenses");
  revalidatePath("/reports");
  revalidateBusinessTags(businessId, ["expenses"]);
}

/**
 * Approve & pay one employee for one pay-day, with an optional bonus. The
 * SECURITY DEFINER RPC snapshots the daily rate, computes base+bonus, sets the
 * record 'paid', and posts the LINKED 'Salaries' expense in one transaction —
 * the payment IS that expense (single source of truth, CLAUDE.md §8). The client
 * never sends a base or total; only the employee, the day, and the bonus.
 */
export async function approveSalary(
  employeeId: string,
  payDate: string,
  bonusCents: number,
): Promise<EmployeePayActionState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.payroll.error" };

  const parsed = approveSalarySchema.safeParse({ employeeId, payDate, bonusCents });
  if (!parsed.success) return { error: "employees.payroll.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_salary_payment", {
    p_employee_id: parsed.data.employeeId,
    p_pay_date: parsed.data.payDate,
    p_bonus_cents: parsed.data.bonusCents,
  });
  if (error) return { error: "employees.payroll.error" };

  revalidatePayrollSurfaces(profile.business_id);
  return { ok: true };
}

/** Unapprove a paid day: reverse the linked expense, set the record pending. */
export async function reverseSalary(paymentId: string): Promise<EmployeePayActionState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.payroll.error" };

  const parsed = salaryPaymentIdSchema.safeParse({ paymentId });
  if (!parsed.success) return { error: "employees.payroll.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_salary_payment", {
    p_payment_id: parsed.data.paymentId,
  });
  if (error) return { error: "employees.payroll.error" };

  revalidatePayrollSurfaces(profile.business_id);
  return { ok: true };
}

/** Delete a pay record entirely (also removes its linked expense, if any). */
export async function deleteSalaryPayment(paymentId: string): Promise<EmployeePayActionState> {
  const profile = await requireRole(["owner"]);
  if (!profile.business_id) return { error: "employees.payroll.error" };

  const parsed = salaryPaymentIdSchema.safeParse({ paymentId });
  if (!parsed.success) return { error: "employees.payroll.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_salary_payment", {
    p_payment_id: parsed.data.paymentId,
  });
  if (error) return { error: "employees.payroll.error" };

  revalidatePayrollSurfaces(profile.business_id);
  return { ok: true };
}

function parseFormData(formData: FormData) {
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null)?.trim() || undefined;
  const dailyPayRaw = (formData.get("daily_pay_lkr") as string | null)?.trim();
  const dailyPayCents =
    dailyPayRaw && dailyPayRaw !== "" ? Math.round(parseInt(dailyPayRaw, 10) * 100) : null;
  const profileIdRaw = (formData.get("profile_id") as string | null)?.trim();
  const profileId = profileIdRaw && profileIdRaw !== "" ? profileIdRaw : null;
  const accessRoleRaw = (formData.get("access_role") as string | null)?.trim();
  // Access role only applies to a linked account; drop it when HR-record only.
  const accessRole =
    profileId && (accessRoleRaw === "owner" || accessRoleRaw === "manager" || accessRoleRaw === "staff")
      ? accessRoleRaw
      : null;

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

  return { name, role, dailyPayCents, profileId, accessRole, permissions, shift };
}

/**
 * Sync a linked account's access role onto its profile (owner-only). Runs
 * through the SECURITY DEFINER `set_account_role` RPC, which re-checks owner +
 * tenant, refuses the caller's own account, and never demotes an owner account.
 * Skipped for the owner's own account. Returns an i18n error key on failure.
 */
async function syncAccountRole(
  ownProfileId: string,
  targetProfileId: string | null,
  accessRole: "owner" | "manager" | "staff" | null,
): Promise<string | null> {
  if (!targetProfileId || !accessRole) return null;
  if (targetProfileId === ownProfileId) return null; // never change own role

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_account_role", {
    target_profile_id: targetProfileId,
    new_role: accessRole,
  });
  if (error) return "employees.form.errorRoleSync";
  return null;
}

/** Map a caught DB error to a friendly form error key. */
function toFormError(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505") {
    return "employees.form.errorAlreadyLinked";
  }
  return "employees.form.errorGeneric";
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
  } catch (err) {
    return { error: toFormError(err) };
  }

  const syncError = await syncAccountRole(profile.id, parsed.data.profileId, parsed.data.accessRole);
  if (syncError) return { error: syncError };

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
  } catch (err) {
    return { error: toFormError(err) };
  }

  const syncError = await syncAccountRole(profile.id, dataParsed.data.profileId, dataParsed.data.accessRole);
  if (syncError) return { error: syncError };

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
