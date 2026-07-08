"use server";

// Finance server actions. addExpense inserts an operating expense.
//
// Security (CLAUDE.md §7): the action re-asserts the Finance role gate
// server-side (defence in depth beside RLS, which also restricts expense to
// owner/manager), validates every field with Zod, and sets business_id +
// created_by from the authenticated profile — never from the client. Amount is
// converted to integer cents here; no float money is stored.

import { revalidatePath } from "next/cache";
import { requireRole, rolesFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCents } from "@/lib/money";
import { addExpenseSchema } from "@/lib/zod/expense";

export type AddExpenseState = { ok?: boolean; error?: string };

export async function addExpense(
  _prevState: AddExpenseState,
  formData: FormData,
): Promise<AddExpenseState> {
  const profile = await requireRole(rolesFor("finance"));
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

  // Refresh the ledger + Overview so the new row and totals appear.
  revalidatePath("/finance");
  return { ok: true };
}
