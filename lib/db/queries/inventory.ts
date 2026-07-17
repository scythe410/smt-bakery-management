// queries/inventory.ts — raw, tenant-scoped inventory reads.
//
// Every read goes through the RLS-scoped server client (anon key), so results
// are always this tenant's rows only — no `.eq('business_id', …)` needed and no
// way to spoof another tenant (CLAUDE.md §7.1/§7.2). No derivation here: rows in,
// rows out. Low-stock tallying + shaping lives in lib/db/selectors/inventory.ts.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";

export type InventoryItemRow = Database["public"]["Tables"]["inventory_item"]["Row"];

/** All inventory items for this tenant, ordered by name (A→Z). */
export async function listInventoryItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * `return` stock movements whose `created_at` falls in the period, summed to a
 * per-item RETURNED quantity (positive) — the end-of-day leftovers pulled from
 * stock today. RLS-scoped like every other read. The selector attaches this to
 * each finished good so the leftover report shows returned qty per item.
 */
export async function listReturnMovements(period: Period): Promise<Map<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_movement")
    .select("inventory_item_id, delta")
    .eq("reason", "return")
    .gte("created_at", period.startUtc)
    .lt("created_at", period.endUtc);

  if (error) throw error;
  const map = new Map<string, number>();
  for (const row of data ?? []) {
    // `return` deltas are negative (stock leaves); report the magnitude returned.
    map.set(row.inventory_item_id, (map.get(row.inventory_item_id) ?? 0) - Number(row.delta ?? 0));
  }
  return map;
}

/**
 * Barcodes for a set of inventory item ids (RLS-scoped) as a code→barcode map.
 * The new-order selector uses it to attach each sold-from-stock menu item's tracked
 * barcode, so billing can quick-add by scan (CLAUDE.md §4). Ids not found or with a
 * null barcode are simply absent from the map.
 */
export async function listBarcodesByItemIds(ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.from("inventory_item").select("id, barcode").in("id", ids);
  if (error) throw error;
  for (const row of data ?? []) if (row.barcode) map.set(row.id, row.barcode);
  return map;
}

/**
 * FINISHED_GOOD-kind items for this tenant (name A→Z) — the Production view's
 * stock list. Low-stock (production-alert) is derived in the selector from
 * qty_on_hand <= low_stock_threshold, the same rule as the production_alert view.
 */
export async function listFinishedGoodItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .select("*")
    .eq("kind", "finished_good")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
