"use server";

// Orders server actions. createOrder mints a new order.
//
// This is the §7.7 hot path: the ONLY money the client sends is which menu items
// and how many. The server ignores any client-sent price/total — all of it is
// recomputed inside a single transactional RPC (public.create_order), which:
//   * resolves the authoritative name + unit_price_cents from menu_item (and
//     snapshots them onto each line),
//   * validates every item belongs to the caller's tenant and is available,
//   * computes subtotal / commission / total server-side from commission_rule,
//   * allocates order_no atomically from a per-tenant counter (no race, no
//     duplicate numbers), and
//   * inserts the order + all its items together (atomic — no orphaned order).
// The RPC is SECURITY INVOKER, so RLS scopes everything to this tenant; a new
// order lands as `pending` (the Active tab). All money is integer cents.

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { newOrderSchema, orderListQuerySchema } from "@/lib/zod/order";
import {
  getOrdersPage,
  type OrderFilterInput,
  type OrdersPageResult,
} from "@/lib/db/selectors/orders";
import type { Database } from "@/lib/supabase/types";

type Enums = Database["public"]["Enums"];

const EMPTY_PAGE: OrdersPageResult = { items: [], hasMore: false };

/**
 * Read one page of the Orders list for the given tab + filters (SPEC §3.4). The
 * client browser calls this on a filter/tab change and on "Load more"; all the
 * filtering + pagination happen in the database (getOrdersPage → listOrdersPage),
 * so the wire only ever carries one page. Auth is re-asserted and the input is
 * Zod-validated (unknown fields rejected); RLS scopes every row to the caller's
 * tenant. Invalid input returns an empty page rather than throwing — the UI shows
 * its no-match/empty state.
 */
export async function fetchOrders(input: unknown): Promise<OrdersPageResult> {
  await requireProfile();
  const parsed = orderListQuerySchema.safeParse(input);
  if (!parsed.success) return EMPTY_PAGE;
  return getOrdersPage(parsed.data as OrderFilterInput);
}

export type CreateOrderState = { ok?: boolean; error?: string; orderNo?: string };

export async function createOrder(
  _prevState: CreateOrderState,
  formData: FormData,
): Promise<CreateOrderState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "orders.new.error" };

  // The form serializes its line items into a single JSON field.
  let itemsRaw: unknown = [];
  try {
    itemsRaw = JSON.parse(String(formData.get("items") ?? "[]"));
  } catch {
    return { error: "orders.new.error" };
  }

  const parsed = newOrderSchema.safeParse({
    source: formData.get("source"),
    customerName: formData.get("customerName") || undefined,
    paymentMethod: formData.get("paymentMethod"),
    paymentStatus: formData.get("paymentStatus"),
    items: itemsRaw,
  });
  if (!parsed.success) return { error: "orders.new.error" };

  // Everything authoritative (prices, totals, commission, numbering, atomicity)
  // happens server-side inside the RPC — the client sends only ids + quantities.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_source: parsed.data.source as Enums["order_source"],
    p_customer_name: parsed.data.customerName ?? "",
    p_payment_method: parsed.data.paymentMethod as Enums["payment_method"],
    p_payment_status: parsed.data.paymentStatus as Enums["payment_status"],
    p_items: parsed.data.items.map((l) => ({ menu_item_id: l.menuItemId, qty: l.qty })),
  });

  // RPC raises on an invalid/cross-tenant/unavailable item or a missing business;
  // all surface as a generic error (don't leak specifics to the client).
  if (error || !data) return { error: "orders.new.error" };

  // Refresh the Orders screen (uncached) + the tenant's order-derived figures
  // (Dashboard / Finance / Reports) via the data cache. `inventory` because a
  // realized order deducts ingredients through the stock_movement ledger, moving
  // qty_on_hand + the low-stock badge (dormant while orders mint as `pending`,
  // but correct the moment create_order ever mints a completed order).
  revalidatePath("/orders");
  revalidateBusinessTags(profile.business_id, ["orders", "inventory"]);
  return { ok: true, orderNo: data.order_no };
}
