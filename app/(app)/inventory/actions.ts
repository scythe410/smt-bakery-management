"use server";

// Inventory server actions. addInventoryItem inserts a stock item; lookupBarcode
// resolves a scanned code to a product to prefill the form (SPEC §5.1).
//
// Security (CLAUDE.md §7): all roles may manage inventory (RLS: customer/
// inventory/menu… are CRUD for owner/manager/staff), so each action re-asserts
// the session (requireProfile) and sets business_id from the authenticated
// profile — never from the client (§7.3). Every field is Zod-validated and
// unknown fields are rejected; the unit cost is converted to integer cents here,
// so no float money is stored (§3). The barcode lookup hits the network on the
// SERVER, so the browser only ever talks to our own origin.

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCents } from "@/lib/money";
import { addInventoryItemSchema, barcodeLookupSchema } from "@/lib/zod/inventory";
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

  // Refresh the list + low-stock counts (list row, pill, nav badge).
  revalidatePath("/inventory");
  return { ok: true };
}

/**
 * Resolve a scanned/typed barcode to a product name + category to PREFILL the
 * add-item form (SPEC §5.1). The session is re-asserted (this hits the network on
 * the server), input is Zod-validated to a GTIN, and every failure path resolves
 * to `found: false` so the client always gets a usable answer and can fall back
 * to a blank form. No write happens here — the user still reviews and submits.
 */
export async function lookupBarcode(code: string): Promise<ProductLookupResult> {
  await requireProfile();
  const parsed = barcodeLookupSchema.safeParse(code);
  if (!parsed.success) return { found: false };
  return lookupProduct(parsed.data);
}
