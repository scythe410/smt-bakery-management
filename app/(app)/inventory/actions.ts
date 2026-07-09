"use server";

// Inventory server actions. addInventoryItem inserts a stock item.
//
// Security (CLAUDE.md §7): all roles may manage inventory (RLS: customer/
// inventory/menu… are CRUD for owner/manager/staff), so the action re-asserts
// the session (requireProfile) and sets business_id from the authenticated
// profile — never from the client (§7.3). Every field is Zod-validated and
// unknown fields are rejected; the unit cost is converted to integer cents here,
// so no float money is stored (§3).

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { toCents } from "@/lib/money";
import { addInventoryItemSchema } from "@/lib/zod/inventory";
import type { Database } from "@/lib/supabase/types";

export type AddInventoryItemState = { ok?: boolean; error?: string };

export async function addInventoryItem(
  _prevState: AddInventoryItemState,
  formData: FormData,
): Promise<AddInventoryItemState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "inventory.add.error" };

  const parsed = addInventoryItemSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind"),
    category: formData.get("category"),
    qtyOnHand: formData.get("qtyOnHand"),
    unit: formData.get("unit"),
    unitCostMajor: formData.get("unitCost"),
    lowStockThreshold: formData.get("lowStockThreshold"),
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
  });
  if (error) return { error: "inventory.add.error" };

  // Refresh the list + low-stock counts (list row, pill, nav badge).
  revalidatePath("/inventory");
  return { ok: true };
}
