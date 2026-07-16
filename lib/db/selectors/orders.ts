// selectors/orders.ts — the Orders screen's derived list (SPEC §3.4). Shapes raw
// order rows into typed, render-ready items: the human order number, source,
// customer (or null → "—"), item count (Σ line qty), stored total, payment
// method/status, order status, and the Active/Archived tab the status maps to.
// The local date key uses the tenant timezone so the screen's date filter and
// any date display read as the shop's wall-clock day. Money stays integer cents;
// nothing is formatted here (format.ts does that).

import "server-only";
import { cache } from "react";
import { getBusiness } from "@/lib/auth";
import {
  countOrdersByStatuses,
  listOrdersPage,
  type OrderWithItems,
} from "@/lib/db/queries/orders";
import { listAvailableMenuItems } from "@/lib/db/queries/menu";
import { listBarcodesByItemIds } from "@/lib/db/queries/inventory";
import { zonedDateKey, zonedWallTimeToUtcIso } from "@/lib/db/period";
import { ACTIVE_STATUSES, ARCHIVED_STATUSES, tabForStatus } from "@/lib/orders/order-config";
import type {
  OrderSource,
  OrderStatus,
  OrderTab,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/orders/order-config";

const DEFAULT_TIMEZONE = "Asia/Colombo";

/** The status set backing each tab (CLAUDE.md §4 — status drives Active/Archived). */
const TAB_STATUSES: Record<OrderTab, readonly OrderStatus[]> = {
  active: ACTIVE_STATUSES,
  archived: ARCHIVED_STATUSES,
};

export type OrderListItem = {
  id: string;
  orderNo: string;
  source: OrderSource;
  /** Denormalized walk-in name, or null → the row renders an em dash. */
  customerName: string | null;
  /** Σ of line-item quantities. */
  itemCount: number;
  totalCents: number;
  paymentMethod: PaymentMethod | null;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  tab: OrderTab;
  /** Local `YYYY-MM-DD` in the tenant timezone — drives the date filter. */
  dateKey: string;
};

function toListItem(o: OrderWithItems, timezone: string): OrderListItem {
  return {
    id: o.id,
    orderNo: o.order_no,
    source: o.source,
    customerName: o.customer_name,
    itemCount: o.order_item.reduce((n, li) => n + li.qty, 0),
    totalCents: o.total_cents,
    paymentMethod: o.payment_method,
    paymentStatus: o.payment_status,
    status: o.status,
    tab: tabForStatus(o.status),
    dateKey: zonedDateKey(o.created_at, timezone),
  };
}

/** Next local calendar day after `YYYY-MM-DD` (pure label arithmetic, UTC math). */
function nextLocalDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** What the Orders screen asks for: the active tab + optional filters + page. */
export type OrderFilterInput = {
  tab: OrderTab;
  source?: OrderSource | null;
  status?: OrderStatus | null;
  payment?: PaymentMethod | null;
  /** Local `YYYY-MM-DD` day filter (tenant timezone). */
  date?: string | null;
  search?: string | null;
  /** Zero-based page index. */
  page?: number;
};

export type OrdersPageResult = {
  items: OrderListItem[];
  /** True when another page exists after this one. */
  hasMore: boolean;
};

/**
 * One page of the Orders list for a given filter set — filtered and paginated in
 * the database (see listOrdersPage). The local `date` filter is resolved to a
 * half-open UTC instant range in the tenant timezone so it matches the same
 * wall-clock day the row's `dateKey` shows. NOT React-cached: it's a dynamic,
 * per-interaction read (the server component seeds page 0; the fetchOrders action
 * serves later pages and filter changes).
 */
export async function getOrdersPage(input: OrderFilterInput): Promise<OrdersPageResult> {
  const business = await getBusiness();
  const timezone = business?.timezone || DEFAULT_TIMEZONE;

  let dateStartUtc: string | null = null;
  let dateEndUtc: string | null = null;
  if (input.date) {
    dateStartUtc = zonedWallTimeToUtcIso(input.date, null, timezone);
    dateEndUtc = zonedWallTimeToUtcIso(nextLocalDay(input.date), null, timezone);
  }

  const { rows, hasMore } = await listOrdersPage(
    {
      statuses: TAB_STATUSES[input.tab],
      source: input.source ?? null,
      status: input.status ?? null,
      payment: input.payment ?? null,
      dateStartUtc,
      dateEndUtc,
      search: input.search ?? null,
    },
    input.page ?? 0,
  );

  return { items: rows.map((o) => toListItem(o, timezone)), hasMore };
}

export type OrderTabCounts = { active: number; archived: number };

/** Active/Archived tab badge counts for this tenant. React-`cache()`d per request. */
export const getOrderTabCounts = cache(async (): Promise<OrderTabCounts> => {
  const counts = await countOrdersByStatuses({
    active: ACTIVE_STATUSES,
    archived: ARCHIVED_STATUSES,
  });
  return { active: counts.active ?? 0, archived: counts.archived ?? 0 };
});

export type NewOrderMenuItem = {
  id: string;
  name: string;
  itemCode: number;
  priceCents: number;
  category: string | null;
  /**
   * Barcode of the tracked sold-from-stock item (finished_good / merchandise), or
   * null for made-to-order items. Lets billing quick-add this menu item by scanning
   * the physical product's barcode (CLAUDE.md §4).
   */
  barcode: string | null;
};

/** Available menu items for the new-order picker. React-`cache()`d per request. */
export const getNewOrderMenu = cache(async (): Promise<NewOrderMenuItem[]> => {
  const rows = await listAvailableMenuItems();
  // Attach the tracked item's barcode so a scan at billing maps to its menu item.
  const trackedIds = rows
    .map((m) => m.tracked_inventory_item_id)
    .filter((id): id is string => id != null);
  const barcodeByItemId = await listBarcodesByItemIds([...new Set(trackedIds)]);
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    itemCode: m.item_code,
    priceCents: m.price_cents,
    category: m.category,
    barcode: m.tracked_inventory_item_id
      ? (barcodeByItemId.get(m.tracked_inventory_item_id) ?? null)
      : null,
  }));
});
