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

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_source: parsed.data.source as Enums["order_source"],
    p_customer_name: parsed.data.customerName ?? "",
    p_payment_method: parsed.data.paymentMethod as Enums["payment_method"],
    p_payment_status: parsed.data.paymentStatus as Enums["payment_status"],
    p_items: parsed.data.items.map((l) => ({ menu_item_id: l.menuItemId, qty: l.qty })),
  });

  if (error || !data) return { error: "orders.new.error" };

  revalidatePath("/orders");
  // "inventory" because a realized order deducts stock via the movement ledger,
  // updating qty_on_hand and the low-stock nav badge.
  revalidateBusinessTags(profile.business_id, ["orders", "inventory"]);
  return { ok: true, orderNo: data.order_no };
}
