// selectors/order-bill.ts — typed data shape and fetcher for the per-order
// bill/receipt. Separating data from render means the same OrderBillData drives
// both the web receipt (components/orders/order-bill.tsx) and the future FT4
// server-side react-pdf route — one source, two render targets.
//
// All money is pre-formatted here (LKR strings) so the render components are
// pure layout: they never call formatLKR themselves and react-pdf never has to
// import the format utilities.

import "server-only";
import { getBusiness } from "@/lib/auth";
import { getOrderWithItems } from "@/lib/db/queries/orders";
import { formatLKR } from "@/lib/format";

// ── Shared data shape ─────────────────────────────────────────────────────────

export type OrderBillLine = {
  nameSnapshot: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  /** Pre-formatted for direct use in render (and in react-pdf, which avoids importing format.ts). */
  unitPriceFmt: string;
  lineTotalFmt: string;
};

/**
 * Everything the bill/receipt component needs — pure data, no fetching.
 * The react-pdf FT4 route imports this type and calls getOrderBillData() then
 * feeds the result to its own Document component.
 */
export type OrderBillData = {
  // Business header
  businessName: string;
  businessLogoUrl: string | null;
  // Order metadata
  orderNo: string;
  /** ISO UTC timestamp — pre-formatted as `createdAtFmt` for display. */
  createdAt: string;
  /** Human date+time string in the tenant's local timezone, e.g. "15 July 2026, 10:34". */
  createdAtFmt: string;
  source: string;
  customerName: string | null;
  // Line items (snapshotted at sale time — never re-read from menu_item)
  lines: OrderBillLine[];
  // Financials (integer cents)
  subtotalCents: number;
  commissionCents: number;
  totalCents: number;
  // Pre-formatted
  subtotalFmt: string;
  commissionFmt: string;
  totalFmt: string;
  // Payment
  paymentMethod: string | null;
  paymentStatus: string;
};

// ── Fetcher ────────────────────────────────────────────────────────────────────

function formatBillDateTime(isoStr: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-LK", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: timezone,
  }).format(new Date(isoStr));
}

/**
 * Fetches the order (RLS-scoped — always this tenant's data) plus the
 * authenticated business profile, then assembles an OrderBillData ready for
 * render. Returns null when the order id doesn't exist or belongs to another
 * tenant (RLS enforces this).
 */
export async function getOrderBillData(orderId: string): Promise<OrderBillData | null> {
  const [business, order] = await Promise.all([getBusiness(), getOrderWithItems(orderId)]);
  if (!order) return null;

  const timezone = business?.timezone ?? "Asia/Colombo";

  const lines: OrderBillLine[] = order.order_item
    .slice()
    .sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot))
    .map((item) => {
      const lineTotalCents = item.unit_price_cents * item.qty;
      return {
        nameSnapshot: item.name_snapshot,
        qty: item.qty,
        unitPriceCents: item.unit_price_cents,
        lineTotalCents,
        unitPriceFmt: formatLKR(item.unit_price_cents),
        lineTotalFmt: formatLKR(lineTotalCents),
      };
    });

  return {
    businessName: business?.name ?? "Samantha's Bakery",
    businessLogoUrl: business?.logo_url ?? null,
    orderNo: order.order_no,
    createdAt: order.created_at,
    createdAtFmt: formatBillDateTime(order.created_at, timezone),
    source: order.source,
    customerName: order.customer_name,
    lines,
    subtotalCents: order.subtotal_cents,
    commissionCents: order.commission_cents,
    totalCents: order.total_cents,
    subtotalFmt: formatLKR(order.subtotal_cents),
    commissionFmt: formatLKR(order.commission_cents),
    totalFmt: formatLKR(order.total_cents),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
  };
}
