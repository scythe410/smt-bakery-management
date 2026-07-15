// Order enums + the Active/Archived tab mapping as client-safe config (SPEC §3.4
// / CLAUDE.md §4, §5). Kept here (no `server-only`) so the filter row, the
// new-order form, and the Zod schema share ONE ordered source of truth. Values
// are enum keys; display labels come from i18n (`source.*`, `orders.status.*`,
// `orders.payment.*`), so nothing user-facing is hardcoded (CLAUDE.md §3).

import type { Database } from "@/lib/supabase/types";

export type OrderSource = Database["public"]["Enums"]["order_source"];
export type OrderStatus = Database["public"]["Enums"]["order_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];
export type PaymentStatus = Database["public"]["Enums"]["payment_status"];

export const ORDER_SOURCES: readonly OrderSource[] = [
  "dine_in",
  "walk_in",
  "whatsapp",
  "online",
  "pickme_food",
  "uber_eats",
] as const;

export const ORDER_STATUSES: readonly OrderStatus[] = ["pending", "completed", "cancelled"] as const;

export const PAYMENT_METHODS: readonly PaymentMethod[] = ["cash", "card", "online", "wallet"] as const;

export const PAYMENT_STATUSES: readonly PaymentStatus[] = ["unpaid", "paid", "refunded"] as const;

export type OrderTab = "active" | "archived";

// CLAUDE.md §4: order.status drives the Active/Archived tabs. Active = still open
// (pending); Archived = closed (completed or cancelled). One place to change the
// split if the client reads the tabs differently (see LOG open questions).
export const ACTIVE_STATUSES: readonly OrderStatus[] = ["pending"] as const;
export const ARCHIVED_STATUSES: readonly OrderStatus[] = ["completed", "cancelled"] as const;

export function tabForStatus(status: OrderStatus): OrderTab {
  return (ACTIVE_STATUSES as readonly OrderStatus[]).includes(status) ? "active" : "archived";
}

// Sensible, ledger-safe transitions offered per current status (SPEC §3.4). Every
// offered action is fully correct under FT1's deduct-once / reverse-once ledger:
//   * pending  → completed (deducts) or cancelled (no stock effect).
//   * completed → cancelled (reverses the sale). A completed order is deliberately
//     NOT reopened to pending — under the idempotency key a reversed order can't be
//     re-completed, so that path would strand it. Void to cancelled instead.
//   * cancelled → pending  (reopen an accidental cancel; back to the Active tab).
// The server RPC re-validates and guards the one unsafe case regardless (a demo
// UI can't be the only gate — CLAUDE.md §7).
export const STATUS_ACTIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ["completed", "cancelled"],
  completed: ["cancelled"],
  cancelled: ["pending"],
};

// Target status → its i18n action-verb key (orders.status.action.*) + button
// intent. Keyed by the TARGET: reaching 'pending' is a "reopen", etc.
export type StatusActionIntent = "primary" | "danger" | "neutral";
export const STATUS_ACTION_META: Record<OrderStatus, { key: string; intent: StatusActionIntent }> = {
  completed: { key: "complete", intent: "primary" },
  cancelled: { key: "cancel", intent: "danger" },
  pending: { key: "reopen", intent: "neutral" },
};
