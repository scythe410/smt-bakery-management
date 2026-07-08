"use client";

// Finance › Expenses ledger (SPEC §3.2). Shows the period's Total Expenses (the
// SAME figure the Overview shows — both derive from the same rows), an
// "+ Add Expense" action, category + search filters, and the entries as stacked
// list-rows (DESIGN.md §4 tables→mobile). Filtering is client-side over the
// already-fetched period; the headline total stays the unfiltered period total
// so it always reconciles with Overview. Categories and notes are business data,
// shown as entered (not translated, CLAUDE.md §3).

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { AddExpenseForm } from "@/components/finance/add-expense-form";
import { formatLKR } from "@/lib/format";
import type { ExpenseEntry } from "@/lib/db/selectors/expenses";

export function ExpensesLedger({
  entries,
  totalCents,
  categories,
}: {
  entries: ExpenseEntry[];
  totalCents: number;
  categories: string[];
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) => {
      if (category && e.category !== category) return false;
      if (q && !`${e.category} ${e.note ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [entries, category, query]);

  const isFiltered = category !== "" || query.trim() !== "";

  return (
    <div className="flex flex-col gap-3">
      {/* Reconciling total + add action */}
      <Card className="flex items-center justify-between gap-3">
        <div>
          <p className="text-caption text-muted tracking-wide uppercase">
            {t("finance.expenses.total")}
          </p>
          <p className="font-display text-display-lg text-brand-ember mt-1 tabular-nums">
            {formatLKR(totalCents)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          aria-expanded={adding}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember flex h-10 shrink-0 items-center gap-1 rounded-[var(--radius)] px-3 font-semibold transition-colors"
        >
          <Plus className="size-4" aria-hidden />
          {t("finance.expenses.add")}
        </button>
      </Card>

      <Card className="flex flex-col gap-3">
        {adding ? <AddExpenseForm onDone={() => setAdding(false)} /> : null}

        {/* Filters */}
        <div className="flex gap-2">
          <select
            aria-label={t("finance.expenses.category")}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
          >
            <option value="">{t("finance.expenses.allCategories")}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("finance.expenses.searchPlaceholder")}
            className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 min-w-0 flex-1 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
          />
        </div>

        {/* Ledger */}
        {entries.length === 0 ? (
          <p className="text-body text-muted py-2">{t("finance.expenses.empty")}</p>
        ) : filtered.length === 0 ? (
          <p className="text-body text-muted py-2">{t("finance.expenses.noMatch")}</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {filtered.map((e) => (
                <li
                  key={e.id}
                  className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusPill tone="neutral" label={e.category} />
                      <span className="text-caption text-muted tabular-nums">{e.date}</span>
                    </div>
                    {e.note ? (
                      <p className="text-caption text-muted mt-1 truncate">{e.note}</p>
                    ) : null}
                  </div>
                  <span className="text-label text-ink shrink-0 tabular-nums">
                    {formatLKR(e.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
            {isFiltered ? (
              <p className="text-caption text-faint">
                {t("finance.expenses.showing", { shown: filtered.length, total: entries.length })}
              </p>
            ) : null}
          </>
        )}
      </Card>
    </div>
  );
}
