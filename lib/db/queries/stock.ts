// queries/stock.ts — raw, tenant-scoped reads for the daily merchandise
// stock-take (stock_day + stock_count_line) and the sale movements that back the
// End-of-Day billing cross-check. No derivation here; the selector shapes these
// into the report / session / dashboard summary (lib/db/selectors/stock.ts).
//
// `scope` (service client + business_id) is passed by cached selectors and
// bypasses RLS, so those reads filter business_id explicitly (see lib/db/cache.ts).
// Without it, the RLS server client scopes the tenant automatically — the live,
// uncached path the interactive stock-take / audit screens use so a just-opened or
// just-closed day is reflected immediately. CLAUDE.md §4, §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";
import type { DbScope } from "@/lib/db/cache";
import type { InventoryCategory, InventoryKind } from "@/lib/inventory-config";

export type StockDayRow = Database["public"]["Tables"]["stock_day"]["Row"];
export type StockCountLineRow = Database["public"]["Tables"]["stock_count_line"]["Row"];
export type MerchandiseItemRow = Database["public"]["Tables"]["inventory_item"]["Row"];

/** A count line joined to the (business, not translated) item name + unit/kind. */
export type StockCountLineWithItem = StockCountLineRow & {
  inventory_item: {
    name: string;
    unit: string;
    kind: InventoryKind;
    category: InventoryCategory;
  } | null;
};

/** The tenant's stock_day for one local `YYYY-MM-DD`, or null if not opened. */
export async function getStockDayByDate(date: string, scope?: DbScope): Promise<StockDayRow | null> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase.from("stock_day").select("*").eq("date", date);
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data;
}

/** The count lines for a stock_day, each with its item name/unit, ordered by name. */
export async function listStockCountLines(
  stockDayId: string,
  scope?: DbScope,
): Promise<StockCountLineWithItem[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("stock_count_line")
    .select("*, inventory_item(name, unit, kind, category)")
    .eq("stock_day_id", stockDayId);
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as StockCountLineWithItem[];
}

/** All merchandise-kind inventory items for this tenant, ordered by name (A→Z). */
export async function listMerchandiseItems(scope?: DbScope): Promise<MerchandiseItemRow[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("inventory_item")
    .select("*")
    .eq("kind", "merchandise")
    .order("name", { ascending: true });
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Suggested selling price (max linked menu price) per merchandise item id. */
export async function listMerchandiseSalePrices(
  scope?: DbScope,
): Promise<Map<string, number>> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase.from("merchandise_sale_price").select("inventory_item_id, price_cents");
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;

  const map = new Map<string, number>();
  for (const row of data ?? []) {
    if (row.inventory_item_id != null) map.set(row.inventory_item_id, Number(row.price_cents ?? 0));
  }
  return map;
}

/**
 * `sale` stock movements whose `created_at` falls in the period — the units
 * BILLED through orders. The selector filters these to merchandise ids and sums
 * `-delta` per item for the End-of-Day billing cross-check (physical out vs
 * billed out ⇒ shrinkage). RLS/business_id scoped like every other read.
 */
export async function listSaleMovements(
  period: Period,
  scope?: DbScope,
): Promise<{ inventory_item_id: string; delta: number }[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("stock_movement")
    .select("inventory_item_id, delta")
    .eq("reason", "sale")
    .gte("created_at", period.startUtc)
    .lt("created_at", period.endUtc);
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((r) => ({
    inventory_item_id: r.inventory_item_id,
    delta: Number(r.delta ?? 0),
  }));
}
