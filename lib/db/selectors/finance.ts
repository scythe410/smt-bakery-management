// selectors/finance.ts — Finance overview: period stat cards + revenue-by-day.
//
// Shares the exact derivation Dashboard and Reports use (selectors/_shared.ts),
// so Finance "Revenue" equals Dashboard "Sales" and Reports "Revenue" for the
// same period, and Finance "Net profit" equals Dashboard "Est. net profit".
// Adds a per-day revenue series for the chart, zero-filled across the window so
// the axis is continuous even on days with no sales.

import "server-only";
import { cache } from "react";
import { listOrdersWithItems } from "@/lib/db/queries/orders";
import { listExpenses } from "@/lib/db/queries/expenses";
import { listCommissionRules, listRecipeCostLines } from "@/lib/db/queries/pricing";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { PeriodInput } from "@/lib/db/period";
import {
  aggregateOrders,
  commissionRateMap,
  estNetProfitCents,
  totalExpensesCents,
  unitCogsMap,
} from "@/lib/db/selectors/_shared";

export type RevenueDay = {
  /** Local calendar day `YYYY-MM-DD`. */
  date: string;
  revenueCents: number;
};

export type FinanceOverview = {
  /** Gross revenue over realized orders — the primary stat card. */
  revenueCents: number;
  /** Operating expenses in the period. */
  expensesCents: number;
  /** Platform commission ("Platform Earnings" card). */
  commissionCents: number;
  /** Estimated cost of goods sold. */
  cogsCents: number;
  /** Estimated net profit = net revenue − COGS − expenses. */
  netProfitCents: number;
  /** Revenue per day across the whole window, zero-filled and in order. */
  revenueByDay: RevenueDay[];
};

async function loadFinanceOverview(input: PeriodInput): Promise<FinanceOverview> {
  const period = await resolveTenantPeriod(input);

  const [orders, expenses, rules, recipeLines] = await Promise.all([
    listOrdersWithItems(period),
    listExpenses(period),
    listCommissionRules(),
    listRecipeCostLines(),
  ]);

  const agg = aggregateOrders(
    orders,
    commissionRateMap(rules),
    unitCogsMap(recipeLines),
    period.timezone,
  );
  const expensesCents = totalExpensesCents(expenses);

  const revenueByDay = period.days.map((date) => ({
    date,
    revenueCents: agg.grossByDay.get(date) ?? 0,
  }));

  return {
    revenueCents: agg.grossCents,
    expensesCents,
    commissionCents: agg.commissionCents,
    cogsCents: agg.cogsCents,
    netProfitCents: estNetProfitCents({
      netCents: agg.netCents,
      cogsCents: agg.cogsCents,
      expensesCents,
    }),
    revenueByDay,
  };
}

/** Finance overview for the period (default: This Month). React-`cache()`d. */
export const getFinanceOverview = cache(
  (input: PeriodInput = { kind: "month" }): Promise<FinanceOverview> => loadFinanceOverview(input),
);
