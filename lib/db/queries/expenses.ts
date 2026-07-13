// queries/expenses.ts — raw, tenant-scoped expense reads. RLS-scoped; no
// derivation here (see lib/db/selectors). CLAUDE.md §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";
import type { DbScope } from "@/lib/db/cache";

export type ExpenseRow = Database["public"]["Tables"]["expense"]["Row"];

/**
 * Expenses dated within the period. `expense.date` is a plain `date`, so it is
 * filtered by the period's inclusive LOCAL calendar bounds (startDate..endDate),
 * not the UTC instant range used for timestamptz columns.
 */
export async function listExpenses(period: Period, scope?: DbScope): Promise<ExpenseRow[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("expense")
    .select("*")
    .gte("date", period.startDate)
    .lte("date", period.endDate)
    .order("date", { ascending: true });
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
