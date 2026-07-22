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
import {
  newOrderSchema,
  orderListQuerySchema,
  orderStatusChangeSchema,
  scanBarcodeSchema,
} from "@/lib/zod/order";
import {
  getOrdersPage,
  type NewOrderMenuItem,
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
    discountPct: formData.get("discountPct") ?? 0,
    items: itemsRaw,
  });
  if (!parsed.success) return { error: "orders.new.error" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_order", {
    p_source: parsed.data.source as Enums["order_source"],
    p_customer_name: parsed.data.customerName ?? "",
    p_payment_method: parsed.data.paymentMethod as Enums["payment_method"],
    p_payment_status: parsed.data.paymentStatus as Enums["payment_status"],
    p_discount_pct: parsed.data.discountPct,
    p_items: parsed.data.items.map((l) => ({ menu_item_id: l.menuItemId, qty: l.qty })),
  });

  if (error || !data) return { error: "orders.new.error" };

  revalidatePath("/orders");
  // "inventory" because a realized order deducts stock via the movement ledger,
  // updating qty_on_hand and the low-stock nav badge.
  revalidateBusinessTags(profile.business_id, ["orders", "inventory"]);
  return { ok: true, orderNo: data.order_no };
}

export type ChangeOrderStatusState = { ok?: boolean; error?: string };

/**
 * Transition an order's status (SPEC §3.4). Ledger safety is NOT re-implemented
 * here: the whole of it lives in the atomic RPC public.set_order_status, which
 * moves the order under RLS and lets the order_sync_stock trigger deduct/reverse
 * stock idempotently in the same transaction. This action only authorizes,
 * validates the input shape, and maps the outcome.
 *
 * Role: requireProfile — whoever can create an order (owner / manager / staff)
 * can complete/cancel it too (RLS scopes it to their own tenant). No aggregate
 * money is exposed, so this stays open to staff (CLAUDE.md §5).
 */
export async function changeOrderStatus(input: unknown): Promise<ChangeOrderStatusState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "orders.status.error" };

  const parsed = orderStatusChangeSchema.safeParse(input);
  if (!parsed.success) return { error: "orders.status.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_order_status", {
    p_order_id: parsed.data.orderId,
    p_new_status: parsed.data.status as Enums["order_status"],
  });

  if (error) {
    // OR001 = the RPC refused to re-complete a reversed order (see migration 016).
    if (error.code === "OR001") return { error: "orders.status.errorReversed" };
    return { error: "orders.status.error" };
  }

  revalidatePath("/orders");
  // Same tags as create: order rows drive Dashboard/Finance/Reports realized
  // revenue (a cancel drops it); inventory changes as stock is reversed/deducted.
  revalidateBusinessTags(profile.business_id, ["orders", "inventory"]);
  return { ok: true };
}

// --- Resolve a scanned barcode at billing -----------------------------------
//
// The barcodes live on STOCK rows (inventory_item), not on the menu — the client
// enters them in Inventory (CF3/§4). Billing scans the physical product, so this
// bridges stock → a sellable menu line:
//   * find the tenant's inventory_item by barcode (RLS-scoped);
//   * if a sold-from-stock menu_item already tracks it, return that item;
//   * otherwise LINK it: create a sold-from-stock menu_item (name + retail price
//     from stock, tracked_inventory_item_id → the stock row) so the sale counts
//     that one row down 1:1 (same record, never a duplicate) and it now shows on
//     the Menu. Requires a retail price on the stock row — surfaced when missing.
// The menu_item carries the sale price; the client never sends money (§7.7).

export type ScanResolveResult =
  | { status: "found"; item: NewOrderMenuItem }
  | { status: "no_price"; name: string }
  | { status: "unknown" };

export async function resolveScannedBarcode(barcode: unknown): Promise<ScanResolveResult> {
  const profile = await requireProfile();
  if (!profile.business_id) return { status: "unknown" };

  const parsed = scanBarcodeSchema.safeParse(barcode);
  if (!parsed.success) return { status: "unknown" };
  const code = parsed.data;

  const supabase = await createClient();

  // barcode is unique-per-business → at most one row.
  const { data: inv } = await supabase
    .from("inventory_item")
    .select("id, name, kind, category, sale_price_cents")
    .eq("barcode", code)
    .maybeSingle();
  if (!inv) return { status: "unknown" };

  // Already linked to a menu item? Bill that same record (no duplicate).
  const { data: linked } = await supabase
    .from("menu_item")
    .select("id, name, item_code, price_cents, category")
    .eq("tracked_inventory_item_id", inv.id)
    .limit(1);
  const existing = linked?.[0];
  if (existing) {
    return {
      status: "found",
      item: {
        id: existing.id,
        name: existing.name,
        itemCode: existing.item_code,
        priceCents: existing.price_cents,
        category: existing.category,
        imageUrl: null,
        barcode: code,
      },
    };
  }

  // Only sold-from-stock lanes can be tracked by a menu item (DB guard, §4).
  if (inv.kind !== "merchandise" && inv.kind !== "finished_good") return { status: "unknown" };
  // Can't sell without a retail price — the user sets it on the stock row.
  if (!inv.sale_price_cents || inv.sale_price_cents <= 0) {
    return { status: "no_price", name: inv.name };
  }

  const { data: created, error } = await supabase
    .from("menu_item")
    .insert({
      business_id: profile.business_id,
      name: inv.name,
      price_cents: inv.sale_price_cents,
      category: inv.category ?? null,
      is_available: true,
      tracked_inventory_item_id: inv.id,
    })
    .select("id, name, item_code, price_cents, category")
    .single();
  if (error || !created) return { status: "unknown" };

  revalidatePath("/menu");
  revalidateBusinessTags(profile.business_id, ["menu", "pricing"]);

  return {
    status: "found",
    item: {
      id: created.id,
      name: created.name,
      itemCode: created.item_code,
      priceCents: created.price_cents,
      category: created.category,
      imageUrl: null,
      barcode: code,
    },
  };
}
