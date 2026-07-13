// selectors/dashboard.ts — the Dashboard's derived figures.
//
// One call, one round of queries, all money pre-computed server-side so the
// screen does zero arithmetic (CLAUDE.md §2 "no money math in components").
// Defaults to Today in the tenant's timezone; accepts any period for reuse.
// Every figure here is the SAME derivation Finance and Reports use — see
// selectors/_shared.ts — so the numbers reconcile across screens.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { listOrdersWithItems } from "@/lib/db/queries/orders";
import { listExpenses } from "@/lib/db/queries/expenses";
import { listCommissionRules, listRecipeCostLines } from "@/lib/db/queries/pricing";
import { resolveTenantPeriodScope, periodCacheKey } from "@/lib/db/selectors/context";
import type { Period, PeriodInput } from "@/lib/db/period";
import { createServiceClient } from "@/lib/supabase/service";
import { businessTags, type DbScope } from "@/lib/db/cache";
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
  /**
   * The Est. Net Profit card's Income / Expenses two-line breakdown (SPEC §3.1),
   * shaped so the card renders two figures and does no math. Framed as the owner
   * reads it: Income is the day's sales; Expenses bundles every cost against them
   * — platform commission + estimated COGS + operating expenses. By construction
   * `incomeCents - expensesCents === estNetProfitCents`, so the breakdown always
   * reconciles with the hero figure above it.
   */
  profit: {
    incomeCents: number;
    expensesCents: number;
  };
};

// Pure derivation (no I/O) — the single place the Dashboard figures are shaped,
// reused by both the fetched path and the empty-tenant guard.
function summarizeDashboard(
  orders: Awaited<ReturnType<typeof listOrdersWithItems>>,
  expenses: Awaited<ReturnType<typeof listExpenses>>,
  rules: Awaited<ReturnType<typeof listCommissionRules>>,
  recipeLines: Awaited<ReturnType<typeof listRecipeCostLines>>,
  timezone: string,
): DashboardSummary {
  const agg = aggregateOrders(orders, commissionRateMap(rules), unitCogsMap(recipeLines), timezone);
  const expensesCents = totalExpensesCents(expenses);
  const estNet = estNetProfitCents({
    netCents: agg.netCents,
    cogsCents: agg.cogsCents,
    expensesCents,
  });

  return {
    salesCents: agg.grossCents,
    orders: countByStatus(orders),
    incomeCents: agg.netCents,
    expensesCents,
    cogsCents: agg.cogsCents,
    commissionCents: agg.commissionCents,
    estNetProfitCents: estNet,
    profit: {
      // Income line = the day's sales (matches the Today's Sales card exactly).
      incomeCents: agg.grossCents,
      // Everything netted off sales to reach profit, in one line.
      expensesCents: agg.commissionCents + agg.cogsCents + expensesCents,
    },
  };
}

/** Fetch this tenant's period rows (cached, service-scoped) and derive the summary. */
async function computeDashboardSummary(
  period: Period,
  businessId: string,
): Promise<DashboardSummary> {
  const scope: DbScope = { client: createServiceClient(), businessId };
  const [orders, expenses, rules, recipeLines] = await Promise.all([
    listOrdersWithItems(period, scope),
    listExpenses(period, scope),
    listCommissionRules(scope),
    listRecipeCostLines(scope),
  ]);
  return summarizeDashboard(orders, expenses, rules, recipeLines, period.timezone);
}

async function loadDashboardSummary(input: PeriodInput): Promise<DashboardSummary> {
  const { period, businessId } = await resolveTenantPeriodScope(input);
  // Signed-out / unassigned (unreachable behind the auth gate): zeroed figures.
  if (!businessId) return summarizeDashboard([], [], [], [], period.timezone);

  // Data cache: keyed by tenant + resolved period; invalidated by the order /
  // expense / pricing tags whenever those rows change (see lib/db/cache.ts).
  return unstable_cache(
    () => computeDashboardSummary(period, businessId),
    ["dashboard-summary", businessId, periodCacheKey(period)],
    {
      tags: [
        businessTags.orders(businessId),
        businessTags.expenses(businessId),
        businessTags.pricing(businessId),
      ],
      revalidate: 3600,
    },
  )();
}

/**
 * Dashboard summary for the given period (default: Today). Wrapped in React
 * `cache()` so repeated calls within one request share a single computation.
 */
export const getDashboardSummary = cache(
  (input: PeriodInput = { kind: "today" }): Promise<DashboardSummary> =>
    loadDashboardSummary(input),
);
