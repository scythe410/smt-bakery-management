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
import { zonedClockTime, type PeriodInput } from "@/lib/db/period";
import {
  aggregateOrders,
  commissionRateMap,
  type PaymentBreakdown,
  type SourceBreakdown,
} from "@/lib/db/selectors/_shared";
import type {
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/orders/order-config";

/**
 * One order in the report's detail table (SPEC §3.5). Unlike the headline
 * figures — which count REALIZED (completed) orders only — the table lists every
 * order in the window with its status, so a pending/cancelled row is visible and
 * labelled. The status pill is why the row total may not sum to the headline
 * revenue; the report notes this rather than hiding it.
 */
export type ReportRow = {
  id: string;
  orderNo: string;
  /** Local `HH:mm` in the tenant timezone. */
  time: string;
  source: OrderSource;
  /** Denormalized walk-in name, or null → the row renders an em dash. */
  customerName: string | null;
  /** Σ of line-item quantities. */
  itemCount: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
};

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
  /** Every order in the window, chronological — the detail table's rows. */
  rows: ReportRow[];
};

async function loadDailyReport(input: PeriodInput): Promise<DailyReport> {
  const period = await resolveTenantPeriod(input);

  const [orders, rules] = await Promise.all([listOrdersWithItems(period), listCommissionRules()]);

  // COGS is not part of the report totals; an empty cost map keeps it out while
  // reusing the one aggregate so revenue/commission match the other screens.
  const agg = aggregateOrders(orders, commissionRateMap(rules), new Map(), period.timezone);

  // listOrdersWithItems returns the window ascending by created_at, so the table
  // reads top-to-bottom in the order the sales happened.
  const rows: ReportRow[] = orders.map((o) => ({
    id: o.id,
    orderNo: o.order_no,
    time: zonedClockTime(o.created_at, period.timezone),
    source: o.source,
    customerName: o.customer_name,
    itemCount: o.order_item.reduce((n, li) => n + li.qty, 0),
    totalCents: o.total_cents,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    status: o.status,
  }));

  return {
    revenueCents: agg.grossCents,
    commissionCents: agg.commissionCents,
    netRevenueCents: agg.netCents,
    orders: agg.orders,
    bySource: agg.bySource,
    byPayment: agg.byPayment,
    rows,
  };
}

/** Daily report for the period (default: Today). React-`cache()`d. */
export const getDailyReport = cache(
  (input: PeriodInput = { kind: "today" }): Promise<DailyReport> => loadDailyReport(input),
);
