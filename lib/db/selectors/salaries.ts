// selectors/salaries.ts — the Salaries report (Reports §5, owner-only). Reads the
// daily-payroll ledger (salary_payment) over a period and rolls it up per employee:
// days paid, base total, bonuses, total paid, and any pending. Grand totals across
// the window.
//
// Single source of truth (CLAUDE.md §4, §8): approving a pay-day POSTS one Finance
// expense (category "Salaries") whose amount IS the payment total, linked by
// expense_id — so payroll is never double-counted. This selector RECONCILES the two
// sides: Σ paid salary totals vs the Σ "Salaries" expenses in the same window, and
// confirms every paid record is linked to an expense. They match by construction;
// the report surfaces the check so the figure is provably the same money Finance
// shows, not a parallel total.
//
// salary_payment is owner-only under RLS, so these reads use the RLS server client
// (no service scope) — the report is owner-gated too. Money stays integer cents;
// formatting is render-time only (format.ts). Employee names are business data,
// shown as entered — not translated.

import "server-only";
import { cache } from "react";
import {
  listSalaryPaymentsInPeriod,
  type SalaryPaymentWithEmployee,
} from "@/lib/db/queries/salary";
import { listExpenses, type ExpenseRow } from "@/lib/db/queries/expenses";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { PeriodInput } from "@/lib/db/period";
import { sum } from "@/lib/money";

/** The expense category the payroll RPC posts under (migration 022). */
const SALARIES_EXPENSE_CATEGORY = "Salaries";

/** One employee's payroll over the window — the report's per-person row. */
export type SalaryEmployeeRow = {
  employeeId: string;
  /** Employee name (business data, as entered), or "" if the employee was removed. */
  name: string;
  /** Count of pay-days marked paid in the window. */
  daysPaid: number;
  /** Σ base (daily-rate snapshot) over the paid days. */
  baseCents: number;
  /** Σ bonus over the paid days. */
  bonusCents: number;
  /** Σ total (base + bonus) over the paid days — the cash actually paid. */
  totalPaidCents: number;
  /** Count of pay-days still pending (approved-but-not-paid rows). */
  pendingDays: number;
  /** Σ total over the pending days — payroll owed but not yet posted. */
  pendingCents: number;
};

export type SalariesReport = {
  /** Per employee, name A→Z. Only employees with a record in the window appear. */
  rows: SalaryEmployeeRow[];
  // ── Grand totals across the window ──
  daysPaid: number;
  baseCents: number;
  bonusCents: number;
  totalPaidCents: number;
  pendingDays: number;
  pendingCents: number;
  // ── Finance reconciliation (CLAUDE.md §8) ──
  /** Σ amount of "Salaries" expenses dated in the window — the Finance figure. */
  financeSalariesCents: number;
  /** True when every paid record links to a posted expense (no phantom pay). */
  allPaidLinked: boolean;
  /** True when totalPaidCents === financeSalariesCents AND allPaidLinked. */
  reconciled: boolean;
};

// Pure derivation (no I/O) — reused by the fetched path and the empty guard.
function summarizeSalaries(
  payments: SalaryPaymentWithEmployee[],
  expenses: ExpenseRow[],
): SalariesReport {
  const byEmployee = new Map<string, SalaryEmployeeRow>();

  for (const p of payments) {
    let row = byEmployee.get(p.employee_id);
    if (!row) {
      row = {
        employeeId: p.employee_id,
        name: p.employee?.name ?? "",
        daysPaid: 0,
        baseCents: 0,
        bonusCents: 0,
        totalPaidCents: 0,
        pendingDays: 0,
        pendingCents: 0,
      };
      byEmployee.set(p.employee_id, row);
    }
    if (p.status === "paid") {
      row.daysPaid += 1;
      row.baseCents += p.base_cents;
      row.bonusCents += p.bonus_cents;
      row.totalPaidCents += p.total_cents;
    } else {
      row.pendingDays += 1;
      row.pendingCents += p.total_cents;
    }
  }

  const rows = [...byEmployee.values()].sort((a, b) => a.name.localeCompare(b.name));

  const paid = payments.filter((p) => p.status === "paid");
  const totalPaidCents = sum(paid.map((p) => p.total_cents));
  const financeSalariesCents = sum(
    expenses.filter((e) => e.category === SALARIES_EXPENSE_CATEGORY).map((e) => e.amount_cents),
  );
  const allPaidLinked = paid.every((p) => p.expense_id !== null);

  return {
    rows,
    daysPaid: sum(rows.map((r) => r.daysPaid)),
    baseCents: sum(rows.map((r) => r.baseCents)),
    bonusCents: sum(rows.map((r) => r.bonusCents)),
    totalPaidCents,
    pendingDays: sum(rows.map((r) => r.pendingDays)),
    pendingCents: sum(rows.map((r) => r.pendingCents)),
    financeSalariesCents,
    allPaidLinked,
    // Payroll posts an expense == its total (linked), so the two sides are equal by
    // construction; a mismatch means a manually-edited/orphaned Salaries expense.
    reconciled: allPaidLinked && totalPaidCents === financeSalariesCents,
  };
}

/** Salaries report for the period (owner-only). React-`cache()`d per request. */
export const getSalariesReport = cache(async (input: PeriodInput): Promise<SalariesReport> => {
  const period = await resolveTenantPeriod(input);
  const [payments, expenses] = await Promise.all([
    listSalaryPaymentsInPeriod(period),
    listExpenses(period),
  ]);
  return summarizeSalaries(payments, expenses);
});
