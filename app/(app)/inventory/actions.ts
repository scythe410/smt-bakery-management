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
  editInventoryItemSchema,
  produceBatchSchema,
  receiveStockSchema,
  returnFinishedGoodSchema,
  setSalePriceSchema,
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
  const rawSalePrice = formData.get("salePrice");
  const parsed = addInventoryItemSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    category: formData.get("category"),
    qtyOnHand: formData.get("qtyOnHand"),
    unit: formData.get("unit"),
    unitCostMajor: formData.get("unitCost"),
    // Absent (field hidden for ingredients) or empty → undefined → NULL (unset).
    salePriceMajor:
      typeof rawSalePrice === "string" && rawSalePrice.trim() !== "" ? rawSalePrice : undefined,
    lowStockThreshold: formData.get("lowStockThreshold"),
    // Empty string (barcode-less add) → undefined → NULL, so the partial unique
    // index isn't tripped by multiple barcode-less items.
    barcode: typeof rawBarcode === "string" && rawBarcode.trim() !== "" ? rawBarcode : undefined,
  });
  if (!parsed.success) return { error: "inventory.add.error" };

  // Retail price applies to sold-from-stock kinds only; never store one for an
  // ingredient (its money story is unit_cost_cents via the recipe/COGS lane).
  const sellable = parsed.data.kind === "merchandise" || parsed.data.kind === "finished_good";

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_item").insert({
    business_id: profile.business_id,
    name: parsed.data.name,
    kind: parsed.data.kind as Database["public"]["Enums"]["inventory_kind"],
    category: parsed.data.category as Database["public"]["Enums"]["inventory_category"],
    qty_on_hand: parsed.data.qtyOnHand,
    unit: parsed.data.unit,
    unit_cost_cents: toCents(parsed.data.unitCostMajor),
    sale_price_cents:
      sellable && parsed.data.salePriceMajor !== undefined
        ? toCents(parsed.data.salePriceMajor)
        : null,
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

export type EditInventoryItemState = { ok?: boolean; error?: string };

/**
 * Edit an existing inventory item — name, kind, category, unit, cost, retail
 * price, low-stock threshold, and BARCODE (the field that lets a manually-added
 * item be recognised when its physical barcode is scanned). Quantity is NOT here
 * (it's a ledger running total; adjust via receive/produce/count-adjust).
 *
 * A KIND change is guarded server-side against the model's invariants that a
 * plain UPDATE would otherwise slip past (the DB triggers fire on recipe_line /
 * menu_item writes, not on an inventory_item kind flip):
 *   - an item used as a recipe INGREDIENT can't become a non-ingredient;
 *   - an item TRACKED by a menu item (sold from stock) can't become an ingredient.
 * Retail price is nulled for ingredients. Barcode uniqueness (23505) is surfaced.
 */
export async function editInventoryItem(
  id: string,
  _prevState: EditInventoryItemState,
  formData: FormData,
): Promise<EditInventoryItemState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "inventory.edit.error" };

  const rawBarcode = formData.get("barcode");
  const rawSalePrice = formData.get("salePrice");
  const parsed = editInventoryItemSchema.safeParse({
    id,
    name: formData.get("name"),
    kind: formData.get("kind"),
    category: formData.get("category"),
    unit: formData.get("unit"),
    unitCostMajor: formData.get("unitCost"),
    salePriceMajor:
      typeof rawSalePrice === "string" && rawSalePrice.trim() !== "" ? rawSalePrice : undefined,
    lowStockThreshold: formData.get("lowStockThreshold"),
    barcode: typeof rawBarcode === "string" && rawBarcode.trim() !== "" ? rawBarcode : undefined,
  });
  if (!parsed.success) return { error: "inventory.edit.error" };

  const supabase = await createClient();

  // Current kind (RLS-scoped — a cross-tenant id is invisible ⇒ not found).
  const { data: current, error: readErr } = await supabase
    .from("inventory_item")
    .select("kind")
    .eq("id", parsed.data.id)
    .maybeSingle();
  if (readErr || !current) return { error: "inventory.edit.error" };

  // Guard a kind change against the model invariants (DB triggers don't cover an
  // inventory_item kind flip — they fire on recipe_line / menu_item writes).
  if (parsed.data.kind !== current.kind) {
    if (current.kind === "ingredient" && parsed.data.kind !== "ingredient") {
      const { count } = await supabase
        .from("recipe_line")
        .select("id", { count: "exact", head: true })
        .eq("inventory_item_id", parsed.data.id);
      if ((count ?? 0) > 0) return { error: "inventory.edit.errorKindRecipe" };
    }
    if (parsed.data.kind === "ingredient") {
      const { count } = await supabase
        .from("menu_item")
        .select("id", { count: "exact", head: true })
        .eq("tracked_inventory_item_id", parsed.data.id);
      if ((count ?? 0) > 0) return { error: "inventory.edit.errorKindTracked" };
    }
  }

  const sellable = parsed.data.kind === "merchandise" || parsed.data.kind === "finished_good";

  const { error } = await supabase
    .from("inventory_item")
    .update({
      name: parsed.data.name,
      kind: parsed.data.kind as Database["public"]["Enums"]["inventory_kind"],
      category: parsed.data.category as Database["public"]["Enums"]["inventory_category"],
      unit: parsed.data.unit,
      unit_cost_cents: toCents(parsed.data.unitCostMajor),
      sale_price_cents:
        sellable && parsed.data.salePriceMajor !== undefined
          ? toCents(parsed.data.salePriceMajor)
          : null,
      low_stock_threshold: parsed.data.lowStockThreshold,
      barcode: parsed.data.barcode ?? null,
    })
    .eq("id", parsed.data.id);
  if (error) {
    if (error.code === UNIQUE_VIOLATION) return { error: "inventory.scan.duplicate" };
    return { error: "inventory.edit.error" };
  }

  revalidatePath("/inventory");
  revalidateBusinessTags(profile.business_id, ["inventory", "pricing"]);
  return { ok: true };
}

export type SetSalePriceState = { ok?: boolean; error?: string };

/**
 * Set the retail selling price on a sellable inventory row (the inline editor on
 * the Inventory list). This is the master price the scan-to-bill flow uses when it
 * links a barcode to a menu item (AUDIT 1.1: the column previously had no write
 * path in the UI). Operational, all roles: a per-item price is a cost/price fact,
 * not an aggregate revenue figure (CLAUDE.md §5). The kind filter keeps ingredients
 * priceless — their money story is unit_cost_cents via the recipe/COGS lane.
 */
export async function setSalePrice(input: {
  inventoryItemId: string;
  salePriceMajor: number;
}): Promise<SetSalePriceState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "inventory.price.error" };

  const parsed = setSalePriceSchema.safeParse(input);
  if (!parsed.success) return { error: "inventory.price.error" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .update({ sale_price_cents: toCents(parsed.data.salePriceMajor) })
    .eq("id", parsed.data.inventoryItemId)
    .in("kind", ["merchandise", "finished_good"])
    .select("id");
  // RLS hides cross-tenant rows and the kind filter skips ingredients — either
  // way zero rows came back, so surface it instead of reporting a phantom save.
  if (error || !data || data.length === 0) return { error: "inventory.price.error" };

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

export type ReturnFinishedGoodState = { ok?: boolean; error?: string };

/**
 * Return (remove) end-of-day leftover units of a finished good — the daily-renewal
 * "return the unsold rolls" step (CLAUDE.md §4 FT3 leftover handling). Posts a
 * `return` stock_movement (out) so the next day starts fresh from the new batch;
 * it is waste/leftover tracking, NOT a sale (no revenue/expense — CLAUDE.md §8).
 * Operational: any tenant member (owner/manager/kitchen) may run it. Identity + the
 * finished-good check are enforced by the SECURITY INVOKER `return_finished_good`
 * RPC under RLS; the client value is never trusted. Revalidates the inventory tag
 * so finished-good qty, the low-stock/production badges, and the bell alert refresh.
 */
export async function returnFinishedGood(input: {
  inventoryItemId: string;
  qty: number;
  note?: string;
}): Promise<ReturnFinishedGoodState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "production.leftovers.error" };

  const parsed = returnFinishedGoodSchema.safeParse(input);
  if (!parsed.success) return { error: "production.leftovers.error" };

  const supabase = await createClient();
  const { error } = await supabase.rpc("return_finished_good", {
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_qty: parsed.data.qty,
    p_note: parsed.data.note ?? undefined,
  });
  if (error) return { error: "production.leftovers.error" };

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
