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
import type { OrderStatus } from "@/lib/orders/order-config";

// ── Shared data shape ─────────────────────────────────────────────────────────

export type OrderBillLine = {
  /**
   * The line's menu item id, or null when that item was deleted. Seeds the
   * edit-order form; the bill itself renders only the snapshot.
   */
  menuItemId: string | null;
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
  /** Optional postal address printed at the foot of the bill; null → omitted. */
  businessAddress: string | null;
  /** Optional phone line(s) printed under the address; null → omitted. */
  businessPhone: string | null;
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
  // Financials (integer cents). subtotal = gross (pre-discount); total = net.
  subtotalCents: number;
  /** Whole-order discount percentage applied (0 = none). */
  discountPct: number;
  /** Resulting discount in cents (= round(subtotal × pct/100)). */
  discountCents: number;
  commissionCents: number;
  totalCents: number;
  // Pre-formatted
  subtotalFmt: string;
  discountFmt: string;
  commissionFmt: string;
  totalFmt: string;
  // Payment
  paymentMethod: string | null;
  paymentStatus: string;
  /** Cash the customer handed over, in cents; null when not recorded (non-cash). */
  tenderedCents: number | null;
  /** Change to return = max(0, tendered − total); null when tendered isn't recorded. */
  changeCents: number | null;
  /** Pre-formatted; empty string when the corresponding value is null. */
  tenderedFmt: string;
  changeFmt: string;
  // Order status — used by the detail view; the bill doesn't render it
  status: OrderStatus;
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

  // Cash tendered is a recorded input; change is derived (never stored). Clamp the
  // display to >= 0 — a bill shows change owed to the customer, not a shortfall.
  const tenderedCents = order.tendered_cents ?? null;
  const changeCents = tenderedCents === null ? null : Math.max(0, tenderedCents - order.total_cents);

  const lines: OrderBillLine[] = order.order_item
    .slice()
    .sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot))
    .map((item) => {
      const lineTotalCents = item.unit_price_cents * item.qty;
      return {
        menuItemId: item.menu_item_id,
        nameSnapshot: item.name_snapshot,
        qty: item.qty,
        unitPriceCents: item.unit_price_cents,
        lineTotalCents,
        unitPriceFmt: formatLKR(item.unit_price_cents),
        lineTotalFmt: formatLKR(lineTotalCents),
      };
    });

  return {
    businessName: business?.name ?? "Samanthas Bake House",
    businessLogoUrl: business?.logo_url ?? null,
    businessAddress: business?.address ?? null,
    businessPhone: business?.phone ?? null,
    orderNo: order.order_no,
    createdAt: order.created_at,
    createdAtFmt: formatBillDateTime(order.created_at, timezone),
    source: order.source,
    customerName: order.customer_name,
    lines,
    subtotalCents: order.subtotal_cents,
    discountPct: order.discount_pct,
    discountCents: order.discount_cents,
    commissionCents: order.commission_cents,
    totalCents: order.total_cents,
    subtotalFmt: formatLKR(order.subtotal_cents),
    discountFmt: formatLKR(order.discount_cents),
    commissionFmt: formatLKR(order.commission_cents),
    totalFmt: formatLKR(order.total_cents),
    paymentMethod: order.payment_method,
    paymentStatus: order.payment_status,
    tenderedCents,
    changeCents,
    tenderedFmt: tenderedCents === null ? "" : formatLKR(tenderedCents),
    changeFmt: changeCents === null ? "" : formatLKR(changeCents),
    status: order.status as OrderStatus,
  };
}
