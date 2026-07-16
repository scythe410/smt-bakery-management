// selectors/expenses.ts — the Finance Expenses ledger (SPEC §3.2). Returns the
// period's expense entries plus the reconciling total, so the ledger's headline
// figure is the SAME number the Overview shows for "Total Expenses" (both derive
// from the same rows). Money stays integer cents.

import "server-only";
import { cache } from "react";
import { listExpenses } from "@/lib/db/queries/expenses";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import { totalExpensesCents } from "@/lib/db/selectors/_shared";
import type { PeriodInput } from "@/lib/db/period";

export type ExpenseEntry = {
  id: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  category: string;
  amountCents: number;
  note: string | null;
  /** Profile id (= auth uid) of the user who created this row — used to gate per-row delete for the staff role. */
  createdBy: string | null;
};

export type ExpenseLedger = {
  entries: ExpenseEntry[];
  totalCents: number;
  /** Distinct categories present in the period, for the filter dropdown. */
  categories: string[];
};

async function loadExpenseLedger(input: PeriodInput): Promise<ExpenseLedger> {
  const period = await resolveTenantPeriod(input);
  const rows = await listExpenses(period);

  const entries: ExpenseEntry[] = rows
    .map((e) => ({
      id: e.id,
      date: e.date,
      category: e.category,
      amountCents: e.amount_cents,
      note: e.note,
      createdBy: e.created_by,
    }))
    // Newest first for a ledger.
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const categories = [...new Set(entries.map((e) => e.category))].sort();

  return { entries, totalCents: totalExpensesCents(rows), categories };
}

/** Expense ledger for the period (default: This Month). React-`cache()`d. */
export const getExpenseLedger = cache(
  (input: PeriodInput = { kind: "month" }): Promise<ExpenseLedger> => loadExpenseLedger(input),
);
