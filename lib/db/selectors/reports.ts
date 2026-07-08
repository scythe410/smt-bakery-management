// selectors/reports.ts — the daily report: revenue / commission / net / orders,
// broken down by source and by payment method.
//
// Same derivation as Dashboard and Finance (selectors/_shared.ts): Reports
// "Revenue" equals Finance "Revenue" for the same period, and Reports
// "Net revenue" = revenue − commission uses the identical commission figure.
// The by-source rows sum back to the headline totals — internal consistency by
// construction, not by coincidence.

import "server-only";
import { cache } from "react";
import { listOrdersWithItems } from "@/lib/db/queries/orders";
import { listCommissionRules } from "@/lib/db/queries/pricing";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { PeriodInput } from "@/lib/db/period";
import {
  aggregateOrders,
  commissionRateMap,
  type PaymentBreakdown,
  type SourceBreakdown,
} from "@/lib/db/selectors/_shared";

export type DailyReport = {
  /** Gross revenue over realized orders. */
  revenueCents: number;
  /** Platform commission over the same orders. */
  commissionCents: number;
  /** Net revenue = revenue − commission. */
  netRevenueCents: number;
  /** Count of realized (completed) orders. */
  orders: number;
  /** Revenue/commission/net + order count per source (desc by revenue). */
  bySource: SourceBreakdown[];
  /** Revenue + order count per payment method (desc by revenue). */
  byPayment: PaymentBreakdown[];
};

async function loadDailyReport(input: PeriodInput): Promise<DailyReport> {
  const period = await resolveTenantPeriod(input);

  const [orders, rules] = await Promise.all([listOrdersWithItems(period), listCommissionRules()]);

  // COGS is not part of the report totals; an empty cost map keeps it out while
  // reusing the one aggregate so revenue/commission match the other screens.
  const agg = aggregateOrders(orders, commissionRateMap(rules), new Map(), period.timezone);

  return {
    revenueCents: agg.grossCents,
    commissionCents: agg.commissionCents,
    netRevenueCents: agg.netCents,
    orders: agg.orders,
    bySource: agg.bySource,
    byPayment: agg.byPayment,
  };
}

/** Daily report for the period (default: Today). React-`cache()`d. */
export const getDailyReport = cache(
  (input: PeriodInput = { kind: "today" }): Promise<DailyReport> => loadDailyReport(input),
);
