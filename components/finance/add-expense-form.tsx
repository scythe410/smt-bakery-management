"use client";

// Add-expense form (SPEC §3.2). Posts to the addExpense server action, which
// re-checks the Finance role, validates with Zod, and sets business_id /
// created_by server-side (CLAUDE.md §7). The amount is entered in rupees and
// converted to integer cents server-side. On success the action revalidates
// /finance (the new row + totals appear) and we close the form.

import { useActionState, useEffect, useId, useRef } from "react";
import { useTranslation } from "react-i18next";
import { addExpense, type AddExpenseState } from "@/app/(app)/finance/actions";
import { EXPENSE_CATEGORIES } from "@/lib/expense-categories";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

export function AddExpenseForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement>(null);
  const ids = useId();
  const [state, formAction, pending] = useActionState<AddExpenseState, FormData>(addExpense, {});

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state.ok, onDone]);

  // Default the date to today (local).
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return (
    <form
      ref={formRef}
      action={formAction}
      className="border-border flex flex-col gap-3 border-b pb-4"
    >
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("finance.expenses.date")}</span>
          <input type="date" name="date" defaultValue={todayStr} required className={FIELD_CLASS} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("finance.expenses.category")}</span>
          <select name="category" defaultValue={EXPENSE_CATEGORIES[0]} className={FIELD_CLASS}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("finance.expenses.amount")} (LKR)</span>
        <input
          type="text"
          name="amount"
          inputMode="decimal"
          required
          className={`${FIELD_CLASS} tabular-nums`}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-muted">{t("finance.expenses.note")}</span>
        <input
          type="text"
          name="note"
          maxLength={500}
          placeholder={t("finance.expenses.notePlaceholder")}
          className={FIELD_CLASS}
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-caption text-danger" id={`${ids}-err`}>
          {t(state.error)}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 flex-1 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("finance.expenses.saving") : t("finance.expenses.save")}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="border-border-strong text-ink text-label hover:bg-surface-2 h-10 rounded-[var(--radius)] border px-4 font-medium transition-colors"
        >
          {t("finance.expenses.cancel")}
        </button>
      </div>
    </form>
  );
}
