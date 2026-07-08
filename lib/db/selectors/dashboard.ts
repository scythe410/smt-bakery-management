// selectors/dashboard.ts — the Dashboard's derived figures.
//
// One call, one round of queries, all money pre-computed server-side so the
// screen does zero arithmetic (CLAUDE.md §2 "no money math in components").
// Defaults to Today in the tenant's timezone; accepts any period for reuse.
// Every figure here is the SAME derivation Finance and Reports use — see
// selectors/_shared.ts — so the numbers reconcile across screens.

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
  countByStatus,
  estNetProfitCents,
  totalExpensesCents,
  unitCogsMap,
  type StatusCounts,
} from "@/lib/db/selectors/_shared";

export type DashboardSummary = {
  /** Realized sales in the period (completed orders), the hero money figure. */
  salesCents: number;
  /** Order counts by status — powers the 2×2 grid (DESIGN.md §4). */
  orders: StatusCounts;
  /** Net revenue after platform commission (the honest income line). */
  incomeCents: number;
  /** Operating expenses recorded in the period. */
  expensesCents: number;
  /** Estimated cost of goods sold (from the BOM). */
  cogsCents: number;
  /** Platform commission taken by aggregators. */
  commissionCents: number;
  /** Estimated net profit = income − COGS − expenses. Labelled "Est." in UI. */
  estNetProfitCents: number;
};

async function loadDashboardSummary(input: PeriodInput): Promise<DashboardSummary> {
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

  return {
    salesCents: agg.grossCents,
    orders: countByStatus(orders),
    incomeCents: agg.netCents,
    expensesCents,
    cogsCents: agg.cogsCents,
    commissionCents: agg.commissionCents,
    estNetProfitCents: estNetProfitCents({
      netCents: agg.netCents,
      cogsCents: agg.cogsCents,
      expensesCents,
    }),
  };
}

/**
 * Dashboard summary for the given period (default: Today). Wrapped in React
 * `cache()` so repeated calls within one request share a single computation.
 */
export const getDashboardSummary = cache(
  (input: PeriodInput = { kind: "today" }): Promise<DashboardSummary> =>
    loadDashboardSummary(input),
);
