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
import { listAllOrdersWithItems } from "@/lib/db/queries/orders";
import { listAvailableMenuItems } from "@/lib/db/queries/menu";
import { zonedDateKey } from "@/lib/db/period";
import { tabForStatus } from "@/lib/orders/order-config";
import type {
  OrderSource,
  OrderStatus,
  OrderTab,
  PaymentMethod,
  PaymentStatus,
} from "@/lib/orders/order-config";

const DEFAULT_TIMEZONE = "Asia/Colombo";

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

async function loadOrdersList(): Promise<OrderListItem[]> {
  const [business, orders] = await Promise.all([getBusiness(), listAllOrdersWithItems()]);
  const timezone = business?.timezone || DEFAULT_TIMEZONE;

  return orders.map((o) => ({
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
  }));
}

/** The Orders list for this tenant, newest first. React-`cache()`d per request. */
export const getOrdersList = cache((): Promise<OrderListItem[]> => loadOrdersList());

export type NewOrderMenuItem = {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
};

/** Available menu items for the new-order picker. React-`cache()`d per request. */
export const getNewOrderMenu = cache(async (): Promise<NewOrderMenuItem[]> => {
  const rows = await listAvailableMenuItems();
  return rows.map((m) => ({
    id: m.id,
    name: m.name,
    priceCents: m.price_cents,
    category: m.category,
  }));
});
