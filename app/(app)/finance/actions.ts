"use server";

// Finance server actions. addExpense inserts an operating expense.

import { revalidatePath } from "next/cache";
import { requireRole, rolesFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { toCents } from "@/lib/money";
import { addExpenseSchema, deleteExpenseSchema } from "@/lib/zod/expense";

export type AddExpenseState = { ok?: boolean; error?: string };

// Expenses are a cost, so they have two UI surfaces: the owner's Finance ›
// Expenses tab and the staff-only standalone /expenses ledger. Authorize the
// union of both (owner + staff); RLS still enforces the real per-role boundary.
const EXPENSE_WRITE_ROLES = [
  ...new Set([...rolesFor("finance"), ...rolesFor("expenses")]),
] as const;

export async function addExpense(
  _prevState: AddExpenseState,
  formData: FormData,
): Promise<AddExpenseState> {
  const profile = await requireRole(EXPENSE_WRITE_ROLES);
  if (!profile.business_id) return { error: "finance.expenses.addError" };

  const parsed = addExpenseSchema.safeParse({
    date: formData.get("date"),
    category: formData.get("category"),
    amountMajor: formData.get("amount"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return { error: "finance.expenses.addError" };

  const supabase = await createClient();
  const { error } = await supabase.from("expense").insert({
    business_id: profile.business_id,
    date: parsed.data.date,
    category: parsed.data.category,
    amount_cents: toCents(parsed.data.amountMajor),
    note: parsed.data.note && parsed.data.note.length > 0 ? parsed.data.note : null,
    created_by: profile.id,
  });
  if (error) return { error: "finance.expenses.addError" };

  // Refresh both expense surfaces so the new row + totals appear wherever it was
  // added: Finance (owner) and the standalone /expenses ledger (staff). The
  // Overview / Dashboard figures come from the data cache (`expenses` tag).
  revalidatePath("/finance");
  revalidatePath("/expenses");
  revalidateBusinessTags(profile.business_id, ["expenses"]);
  return { ok: true };
}

export type DeleteExpenseState = { ok?: boolean; error?: string };

export async function deleteExpense(
  _prevState: DeleteExpenseState,
  formData: FormData,
): Promise<DeleteExpenseState> {
  const profile = await requireRole(EXPENSE_WRITE_ROLES);
  if (!profile.business_id) return { error: "finance.expenses.deleteError" };

  const parsed = deleteExpenseSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) return { error: "finance.expenses.deleteError" };

  const supabase = await createClient();
  // RLS enforces the permission: staff can only delete their own rows; owner/manager
  // can delete any row within their tenant. The .eq('business_id') filter is an
  // additional defence-in-depth guard — RLS already scopes by tenant.
  const { error } = await supabase
    .from("expense")
    .delete()
    .eq("id", parsed.data.id)
    .eq("business_id", profile.business_id);
  if (error) return { error: "finance.expenses.deleteError" };

  revalidatePath("/finance");
  revalidatePath("/expenses");
  revalidateBusinessTags(profile.business_id, ["expenses"]);
  return { ok: true };
}
