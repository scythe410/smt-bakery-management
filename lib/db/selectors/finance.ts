// selectors/finance.ts — Finance screen figures (SPEC §3.2): the Overview stat
// cards + revenue-by-day series, and the per-source Platform Earnings breakdown.
//
// Every money figure flows through the same derivation Dashboard and Reports use
// (selectors/_shared.ts), so for a given period Finance "Total Income" equals the
// Dashboard's realized sales, and Finance "Net Profit" equals the Dashboard's
// Est. Net Profit — they reconcile by construction. All money is integer cents;
// nothing is formatted here.

import "server-only";
import { cache } from "react";
import { listOrdersWithItems } from "@/lib/db/queries/orders";
import { listExpenses } from "@/lib/db/queries/expenses";
import { listBookingsInRange } from "@/lib/db/queries/bookings";
import { listCommissionRules, listRecipeCostLines } from "@/lib/db/queries/pricing";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { PeriodInput } from "@/lib/db/period";
import type { Database } from "@/lib/supabase/types";
import {
  aggregateOrders,
  bookingRevenueCents,
  commissionRateMap,
  countByStatus,
  estNetProfitCents,
  totalExpensesCents,
  unitCogsMap,
} from "@/lib/db/selectors/_shared";

type OrderSource = Database["public"]["Enums"]["order_source"];

export type RevenueDay = {
  /** Local calendar day `YYYY-MM-DD`. */
  date: string;
  revenueCents: number;
};

export type FinanceOverview = {
  /** Realized order revenue (completed orders) — the "Total Income" card. */
  totalIncomeCents: number;
  /** Committed value of non-cancelled bookings in the period (pipeline). */
  bookingRevenueCents: number;
  /** Operating expenses recorded in the period — the "Total Expenses" card. */
  totalExpensesCents: number;
  /** Estimated net profit = income − commission − COGS − expenses. */
  netProfitCents: number;
  /** Count of orders in the period (all statuses) — the "Total Orders" card. */
  totalOrders: number;
  /** Platform commission over the period (equals Platform Earnings total). */
  commissionCents: number;
  /** Estimated cost of goods sold. */
  cogsCents: number;
  /** Revenue per day across the whole window, zero-filled and in order. */
  revenueByDay: RevenueDay[];
};

async function loadFinanceOverview(input: PeriodInput): Promise<FinanceOverview> {
  const period = await resolveTenantPeriod(input);

  const [orders, expenses, bookings, rules, recipeLines] = await Promise.all([
    listOrdersWithItems(period),
    listExpenses(period),
    listBookingsInRange(period),
    listCommissionRules(),
    listRecipeCostLines(),
  ]);

  const agg = aggregateOrders(
    orders,
    commissionRateMap(rules),
    unitCogsMap(recipeLines),
    period.timezone,
  );
  const expensesTotal = totalExpensesCents(expenses);

  return {
    totalIncomeCents: agg.grossCents,
    bookingRevenueCents: bookingRevenueCents(bookings),
    totalExpensesCents: expensesTotal,
    netProfitCents: estNetProfitCents({
      netCents: agg.netCents,
      cogsCents: agg.cogsCents,
      expensesCents: expensesTotal,
    }),
    totalOrders: countByStatus(orders).total,
    commissionCents: agg.commissionCents,
    cogsCents: agg.cogsCents,
    revenueByDay: period.days.map((date) => ({
      date,
      revenueCents: agg.grossByDay.get(date) ?? 0,
    })),
  };
}

/** Finance overview for the period (default: This Month). React-`cache()`d. */
export const getFinanceOverview = cache(
  (input: PeriodInput = { kind: "month" }): Promise<FinanceOverview> => loadFinanceOverview(input),
);

// --- Platform Earnings ------------------------------------------------------

export type PlatformEarningRow = {
  source: OrderSource;
  /** Realized orders from this source in the period. */
  orders: number;
  /** Gross revenue from this source (the base commission is charged on). */
  grossCents: number;
  /** Commission rate in basis points (from commission_rule). */
  rateBps: number;
  /** Commission earned by the platform on this source. */
  commissionCents: number;
};

export type PlatformEarnings = {
  rows: PlatformEarningRow[];
  totalGrossCents: number;
  totalCommissionCents: number;
};

async function loadPlatformEarnings(input: PeriodInput): Promise<PlatformEarnings> {
  const period = await resolveTenantPeriod(input);

  const [orders, rules] = await Promise.all([listOrdersWithItems(period), listCommissionRules()]);

  const rates = commissionRateMap(rules);
  // COGS irrelevant here; empty map keeps commission/gross identical to Overview.
  const agg = aggregateOrders(orders, rates, new Map(), period.timezone);

  const rows: PlatformEarningRow[] = agg.bySource.map((s) => ({
    source: s.source,
    orders: s.orders,
    grossCents: s.grossCents,
    rateBps: rates.get(s.source) ?? 0,
    commissionCents: s.commissionCents,
  }));
  // Commission-bearing sources first (the ones that actually earn), then by gross.
  rows.sort((a, b) => b.commissionCents - a.commissionCents || b.grossCents - a.grossCents);

  return {
    rows,
    totalGrossCents: agg.grossCents,
    totalCommissionCents: agg.commissionCents,
  };
}

/**
 * Per-source platform commission for the period (default: This Month). The total
 * equals the Overview "Platform Earnings"/commission figure — same aggregate.
 * React-`cache()`d.
 */
export const getPlatformEarnings = cache(
  (input: PeriodInput = { kind: "month" }): Promise<PlatformEarnings> =>
    loadPlatformEarnings(input),
);
