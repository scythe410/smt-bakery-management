"use server";

// Ingredient-audit server action (periodic spot-count — the ingredient lane's
// reconciliation, kept separate from the daily merchandise count). A counted qty
// is compared to the system qty_on_hand; the difference posts a `count_adjust`
// movement (counted − system) so the variance lands in the one ledger and
// qty_on_hand stays the running total. A single ledger insert (like a restock),
// so no RPC is needed (LOG 2026-07-14).
//
// Security (CLAUDE.md §7): re-asserts the session, Zod-validates the input, and
// reads the item through the RLS client (so it can only ever be this tenant's).
// Rejects a non-ingredient item — merchandise is reconciled by the daily count,
// not here. business_id is stamped from the session by the insert trigger.

import { revalidatePath } from "next/cache";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { stockAuditSchema, type StockAuditInput } from "@/lib/zod/stock";

export type StockAuditState = {
  ok?: boolean;
  error?: string;
  /** The result, echoed for the UI to show the variance (owner/manager). */
  result?: { systemQty: number; countedQty: number; varianceUnits: number; unit: string };
};

export async function recordStockAudit(input: StockAuditInput): Promise<StockAuditState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "stock.error.generic" };

  const parsed = stockAuditSchema.safeParse(input);
  if (!parsed.success) return { error: "stock.error.generic" };

  const supabase = await createClient();
  const { data: item, error: readErr } = await supabase
    .from("inventory_item")
    .select("id, qty_on_hand, unit, kind")
    .eq("id", parsed.data.inventoryItemId)
    .maybeSingle();
  if (readErr || !item) return { error: "stock.error.generic" };
  // The daily merchandise count reconciles merchandise; the audit is ingredients.
  if (item.kind !== "ingredient") return { error: "stock.audit.notIngredient" };

  const systemQty = Number(item.qty_on_hand ?? 0);
  const varianceUnits = parsed.data.countedQty - systemQty;

  // No variance ⇒ nothing to reconcile; post no movement (zero-delta is noise).
  if (varianceUnits !== 0) {
    const { error: insErr } = await supabase.from("stock_movement").insert({
      business_id: profile.business_id,
      inventory_item_id: item.id,
      delta: varianceUnits,
      reason: "count_adjust",
      note: parsed.data.note ?? "ingredient audit",
    });
    if (insErr) return { error: "stock.error.generic" };

    // qty_on_hand changed ⇒ the low-stock badge + inventory list refresh.
    revalidateBusinessTags(profile.business_id, ["inventory"]);
    revalidatePath("/inventory");
    revalidatePath("/inventory/audit");
  }

  return {
    ok: true,
    result: { systemQty, countedQty: parsed.data.countedQty, varianceUnits, unit: item.unit },
  };
}
