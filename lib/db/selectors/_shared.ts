// selectors/_shared.ts — the canonical rules that turn rows into money.
//
// Dashboard, Finance, and Reports must reconcile: the same period must yield the
// same revenue, the same commission, the same profit on every screen. The only
// way to guarantee that is for all three to derive their figures from ONE place.
// That place is here. Screens never re-implement any of this; they call a
// selector, which calls these helpers.
//
// Definitions (fixed here, referenced everywhere):
//   * REALIZED revenue = orders with status 'completed'. Pending orders are not
//     yet money in the till; cancelled/refunded orders are not sales. Both are
//     still counted in the status breakdown, but neither contributes revenue.
//   * Gross revenue      = Σ order.total_cents over completed orders.
//   * Platform commission = Σ round(subtotal × rate_bps / 10000) over completed
//     orders, using commission_rule per source. Recomputed here from stored
//     subtotals + rules — never trusting a client-sent figure (CLAUDE.md §7.7).
//   * Net revenue        = gross − commission (what the business keeps of sales).
//   * COGS (estimated)   = Σ over completed line items of unitCogs × qty, where
//     unitCogs = round(Σ recipe.qty × ingredient.unit_cost_cents). Labelled an
//     estimate because it is derived from the BOM, not from actual lot costs.
//   * Est. net profit    = net revenue − COGS − operating expenses. An estimate
//     for the same reason (CLAUDE.md §3 "Correctness").
//
// All money stays integer cents; nothing is formatted here (format.ts does that).

import { add, applyRateBps, multiply, sum } from "@/lib/money";
import type { Database } from "@/lib/supabase/types";
import type { OrderWithItems } from "@/lib/db/queries/orders";
import type { CommissionRuleRow, RecipeCostLine } from "@/lib/db/queries/pricing";
import { zonedDateKey } from "@/lib/db/period";

type OrderSource = Database["public"]["Enums"]["order_source"];
type OrderStatus = Database["public"]["Enums"]["order_status"];
type PaymentMethod = Database["public"]["Enums"]["payment_method"];

/** The single order status that counts as realized revenue. */
export const REALIZED_STATUS: OrderStatus = "completed";

/** Is this order realized revenue (money actually made)? */
export function isRealized(order: { status: OrderStatus }): boolean {
  return order.status === REALIZED_STATUS;
}

// --- Reference maps ---------------------------------------------------------

/** source → rate_bps. Missing source ⇒ 0% (own channel), matching the seed. */
export function commissionRateMap(rules: CommissionRuleRow[]): Map<OrderSource, number> {
  const map = new Map<OrderSource, number>();
  for (const r of rules) map.set(r.source, r.rate_bps);
  return map;
}

/**
 * menu_item_id → estimated cost of one unit sold, in whole cents. Rounds ONCE,
 * per menu item, after summing the fractional BOM contributions — so an order's
 * COGS is (integer unitCogs × integer qty), which multiply() keeps exact.
 */
export function unitCogsMap(lines: RecipeCostLine[]): Map<string, number> {
  const raw = new Map<string, number>();
  for (const line of lines) {
    const contribution = line.qty * line.unit_cost_cents; // fractional cents
    raw.set(line.menu_item_id, (raw.get(line.menu_item_id) ?? 0) + contribution);
  }
  const rounded = new Map<string, number>();
  for (const [menuItemId, cents] of raw) rounded.set(menuItemId, Math.round(cents));
  return rounded;
}

// --- Per-order derivation ---------------------------------------------------

/**
 * Commission for one order, recomputed from its stored subtotal and the rule for
 * its source. We do not read order.commission_cents: recomputing is the rule
 * (CLAUDE.md §7.7), and it keeps every screen consistent with the current rules.
 */
export function orderCommissionCents(
  order: Pick<OrderWithItems, "subtotal_cents" | "source">,
  rates: Map<OrderSource, number>,
): number {
  return applyRateBps(order.subtotal_cents, rates.get(order.source) ?? 0);
}

/** Estimated COGS for one order: Σ unitCogs(menu_item) × qty over its lines. */
export function orderCogsCents(order: OrderWithItems, unitCogs: Map<string, number>): number {
  return sum(
    order.order_item.map((item) => {
      const unit = item.menu_item_id ? (unitCogs.get(item.menu_item_id) ?? 0) : 0;
      return multiply(unit, item.qty);
    }),
  );
}

// --- Aggregate over a set of orders -----------------------------------------

export type SourceBreakdown = {
  source: OrderSource;
  orders: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
};

export type PaymentBreakdown = {
  method: PaymentMethod | "unknown";
  orders: number;
  grossCents: number;
};

export type StatusCounts = {
  total: number;
  completed: number;
  pending: number;
  cancelled: number;
};

export type OrderAggregate = {
  /** Count of realized (completed) orders. */
  orders: number;
  grossCents: number;
  commissionCents: number;
  netCents: number;
  cogsCents: number;
  bySource: SourceBreakdown[];
  byPayment: PaymentBreakdown[];
  /** Local `YYYY-MM-DD` → gross revenue that day (realized orders only). */
  grossByDay: Map<string, number>;
};

/**
 * Roll a set of orders up into every revenue figure the screens need, over the
 * REALIZED subset only. Given the same orders + rules + costs, this returns the
 * same numbers every time — that determinism is what makes the screens agree.
 */
export function aggregateOrders(
  orders: OrderWithItems[],
  rates: Map<OrderSource, number>,
  unitCogs: Map<string, number>,
  timezone: string,
): OrderAggregate {
  const bySource = new Map<OrderSource, SourceBreakdown>();
  const byPayment = new Map<PaymentMethod | "unknown", PaymentBreakdown>();
  const grossByDay = new Map<string, number>();

  let orderCount = 0;
  let grossCents = 0;
  let commissionCents = 0;
  let cogsCents = 0;

  for (const order of orders) {
    if (!isRealized(order)) continue;

    const gross = order.total_cents;
    const commission = orderCommissionCents(order, rates);
    const cogs = orderCogsCents(order, unitCogs);

    orderCount += 1;
    grossCents = add(grossCents, gross);
    commissionCents = add(commissionCents, commission);
    cogsCents = add(cogsCents, cogs);

    const s = bySource.get(order.source) ?? {
      source: order.source,
      orders: 0,
      grossCents: 0,
      commissionCents: 0,
      netCents: 0,
    };
    s.orders += 1;
    s.grossCents = add(s.grossCents, gross);
    s.commissionCents = add(s.commissionCents, commission);
    s.netCents = s.grossCents - s.commissionCents;
    bySource.set(order.source, s);

    const method = order.payment_method ?? "unknown";
    const p = byPayment.get(method) ?? { method, orders: 0, grossCents: 0 };
    p.orders += 1;
    p.grossCents = add(p.grossCents, gross);
    byPayment.set(method, p);

    const dayKey = zonedDateKey(order.created_at, timezone);
    grossByDay.set(dayKey, add(grossByDay.get(dayKey) ?? 0, gross));
  }

  return {
    orders: orderCount,
    grossCents,
    commissionCents,
    netCents: grossCents - commissionCents,
    cogsCents,
    bySource: [...bySource.values()].sort((a, b) => b.grossCents - a.grossCents),
    byPayment: [...byPayment.values()].sort((a, b) => b.grossCents - a.grossCents),
    grossByDay,
  };
}

/** Status tally over ALL orders in the window (not just realized ones). */
export function countByStatus(orders: { status: OrderStatus }[]): StatusCounts {
  const counts: StatusCounts = { total: 0, completed: 0, pending: 0, cancelled: 0 };
  for (const o of orders) {
    counts.total += 1;
    counts[o.status] += 1;
  }
  return counts;
}

/** Sum of operating expense rows, integer cents. */
export function totalExpensesCents(expenses: { amount_cents: number }[]): number {
  return sum(expenses.map((e) => e.amount_cents));
}

/**
 * Est. net profit = net revenue − COGS − operating expenses (all integer cents).
 * The one profit formula; Dashboard and Finance both call this so their
 * "profit" can never drift apart.
 */
export function estNetProfitCents(input: {
  netCents: number;
  cogsCents: number;
  expensesCents: number;
}): number {
  return input.netCents - input.cogsCents - input.expensesCents;
}
