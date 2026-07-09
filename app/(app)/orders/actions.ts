"use server";

// Orders server actions. createOrder mints a new order.
//
// This is the §7.7 hot path: the ONLY money the client sends is which menu items
// and how many. The server ignores any client-sent price/total and RECOMPUTES
// everything from stored data:
//   * unit price + name  ← the menu_item rows (snapshotted onto each line)
//   * subtotal           ← Σ storedPrice × qty
//   * commission         ← subtotal × commission_rule.rate_bps for the source
//   * total              ← subtotal (commission is the platform's cut, tracked
//                          separately, not added on top — matches the seed model)
// business_id is set from the authenticated profile; a new order lands as
// `pending` (the Active tab). All money is integer cents (CLAUDE.md §3).

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { listMenuItemsByIds } from "@/lib/db/queries/menu";
import { listCommissionRules } from "@/lib/db/queries/pricing";
import { listOrderNos } from "@/lib/db/queries/orders";
import { commissionRateMap, orderCommissionCents } from "@/lib/db/selectors/_shared";
import { add, multiply, sum } from "@/lib/money";
import { newOrderSchema } from "@/lib/zod/order";
import type { Database } from "@/lib/supabase/types";
import type { OrderSource } from "@/lib/orders/order-config";

export type CreateOrderState = { ok?: boolean; error?: string; orderNo?: string };

/** Next human-friendly order number: `ORD-<max existing suffix + 1>`. */
function nextOrderNo(existing: string[]): string {
  let max = 1000;
  for (const no of existing) {
    const m = /(\d+)\s*$/.exec(no);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `ORD-${max + 1}`;
}

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

  // Collapse duplicate lines (same item picked twice) into one per menu item.
  const qtyByItem = new Map<string, number>();
  for (const line of parsed.data.items) {
    qtyByItem.set(line.menuItemId, (qtyByItem.get(line.menuItemId) ?? 0) + line.qty);
  }
  const menuItemIds = [...qtyByItem.keys()];

  // Authoritative prices/names come from the DB, never the client (§7.7).
  const menuItems = await listMenuItemsByIds(menuItemIds);
  const menuById = new Map(menuItems.map((m) => [m.id, m]));
  // Every submitted id must resolve to one of this tenant's menu items.
  if (menuItems.length !== menuItemIds.length) return { error: "orders.new.invalidItem" };

  const lines = menuItemIds.map((id) => {
    const menu = menuById.get(id)!;
    const qty = qtyByItem.get(id)!;
    return {
      menu_item_id: id,
      name_snapshot: menu.name,
      unit_price_cents: menu.price_cents,
      qty,
      lineTotal: multiply(menu.price_cents, qty),
    };
  });

  const subtotalCents = sum(lines.map((l) => l.lineTotal));

  // Commission recomputed from the rule for this source (0 for own channels).
  const source = parsed.data.source as OrderSource;
  const rates = commissionRateMap(await listCommissionRules());
  const commissionCents = orderCommissionCents({ subtotal_cents: subtotalCents, source }, rates);

  // total = subtotal (commission is deducted from the merchant's take, not added
  // to the bill) — consistent with the seed + the revenue selectors.
  const totalCents = add(subtotalCents, 0);

  const orderNo = nextOrderNo(await listOrderNos());

  const supabase = await createClient();
  const { data: inserted, error: orderErr } = await supabase
    .from("order")
    .insert({
      business_id: profile.business_id,
      order_no: orderNo,
      source,
      customer_name: parsed.data.customerName ?? null,
      subtotal_cents: subtotalCents,
      commission_cents: commissionCents,
      total_cents: totalCents,
      payment_method: parsed.data.paymentMethod as Database["public"]["Enums"]["payment_method"],
      payment_status: parsed.data.paymentStatus as Database["public"]["Enums"]["payment_status"],
      status: "pending",
    })
    .select("id")
    .single();
  if (orderErr || !inserted) return { error: "orders.new.error" };

  const { error: itemsErr } = await supabase.from("order_item").insert(
    lines.map((l) => ({
      business_id: profile.business_id!,
      order_id: inserted.id,
      menu_item_id: l.menu_item_id,
      name_snapshot: l.name_snapshot,
      unit_price_cents: l.unit_price_cents,
      qty: l.qty,
    })),
  );
  if (itemsErr) {
    // Don't leave a total-less order behind if the lines fail to write.
    await supabase.from("order").delete().eq("id", inserted.id);
    return { error: "orders.new.error" };
  }

  revalidatePath("/orders");
  return { ok: true, orderNo };
}
