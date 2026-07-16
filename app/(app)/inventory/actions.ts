"use server";

// Inventory server actions. addInventoryItem inserts a stock item; lookupBarcode
// resolves a scanned code to a product to prefill the form. Barcode lookup is
// server-side so the browser never reaches the external product API directly.

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { toCents } from "@/lib/money";
import {
  addInventoryItemSchema,
  barcodeLookupSchema,
  produceBatchSchema,
  receiveStockSchema,
} from "@/lib/zod/inventory";
import { lookupProduct, type ProductLookupResult } from "@/lib/inventory/product-lookup";
import type { Database } from "@/lib/supabase/types";

export type AddInventoryItemState = { ok?: boolean; error?: string };

// Postgres unique_violation — a barcode already on one of this tenant's items
// (partial unique index on (business_id, barcode)).
const UNIQUE_VIOLATION = "23505";

export async function addInventoryItem(
  _prevState: AddInventoryItemState,
  formData: FormData,
): Promise<AddInventoryItemState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "inventory.add.error" };

  const rawBarcode = formData.get("barcode");
  const parsed = addInventoryItemSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    category: formData.get("category"),
    qtyOnHand: formData.get("qtyOnHand"),
    unit: formData.get("unit"),
    unitCostMajor: formData.get("unitCost"),
    lowStockThreshold: formData.get("lowStockThreshold"),
    // Empty string (barcode-less add) → undefined → NULL, so the partial unique
    // index isn't tripped by multiple barcode-less items.
    barcode: typeof rawBarcode === "string" && rawBarcode.trim() !== "" ? rawBarcode : undefined,
  });
  if (!parsed.success) return { error: "inventory.add.error" };

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_item").insert({
    business_id: profile.business_id,
    name: parsed.data.name,
    kind: parsed.data.kind as Database["public"]["Enums"]["inventory_kind"],
    category: parsed.data.category as Database["public"]["Enums"]["inventory_category"],
    qty_on_hand: parsed.data.qtyOnHand,
    unit: parsed.data.unit,
    unit_cost_cents: toCents(parsed.data.unitCostMajor),
    low_stock_threshold: parsed.data.lowStockThreshold,
    barcode: parsed.data.barcode ?? null,
  });
  if (error) {
    // A duplicate barcode is a nameable, user-fixable case — flag it distinctly.
    if (error.code === UNIQUE_VIOLATION) return { error: "inventory.scan.duplicate" };
    return { error: "inventory.add.error" };
  }

  // Refresh the list + low-stock counts (list row, pill, nav badge → shell cache).
  revalidatePath("/inventory");
  revalidateBusinessTags(profile.business_id, ["inventory"]);
  return { ok: true };
}

export async function lookupBarcode(code: string): Promise<ProductLookupResult> {
  await requireProfile();
  const parsed = barcodeLookupSchema.safeParse(code);
  if (!parsed.success) return { found: false };
  return lookupProduct(parsed.data);
}

export type ProduceBatchState = { ok?: boolean; error?: string };

/**
 * Produce a batch (+qty) of a finished good — the morning "make 20" step
 * (CLAUDE.md §4 FT3). Operational: any tenant member (owner/manager/staff) may
 * run it. Identity + the finished-good check are enforced by the SECURITY INVOKER
 * `produce_batch` RPC under RLS; the client value is never trusted. Revalidates
 * the inventory tag so the finished-good qty, the low-stock/production badges, and
 * the bell alert count all refresh.
 */
export async function produceBatch(input: {
  inventoryItemId: string;
  qty: number;
  note?: string;
}): Promise<ProduceBatchState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "production.error" };

  const parsed = produceBatchSchema.safeParse(input);
  if (!parsed.success) return { error: "production.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("produce_batch", {
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_qty: parsed.data.qty,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return { error: "production.error" };

  revalidatePath("/inventory/production");
  revalidatePath("/inventory");
  revalidateBusinessTags(profile.business_id, ["inventory"]);
  return { ok: true };
}

export type ReceiveStockState = { ok?: boolean; error?: string; qtyOnHand?: number };

/**
 * Receive goods into stock (+qty) — the scan-on-receipt step for bought-in resale
 * goods (CLAUDE.md §4). Operational: any tenant member (owner/manager/staff) may
 * run it. Identity + the item resolution are enforced by the SECURITY INVOKER
 * `receive_stock` RPC under RLS; the client value is never trusted. Revalidates
 * the inventory tag so qty_on_hand, the low-stock pill, and the nav badge refresh.
 */
export async function receiveStock(input: {
  inventoryItemId: string;
  qty: number;
  note?: string;
}): Promise<ReceiveStockState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "inventory.receive.error" };

  const parsed = receiveStockSchema.safeParse(input);
  if (!parsed.success) return { error: "inventory.receive.error" };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_stock", {
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_qty: parsed.data.qty,
    p_note: parsed.data.note ?? undefined,
  });
  if (error || !data) return { error: "inventory.receive.error" };

  revalidatePath("/inventory");
  revalidateBusinessTags(profile.business_id, ["inventory"]);
  return { ok: true, qtyOnHand: Number(data.qty_on_hand) };
}
