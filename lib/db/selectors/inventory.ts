// selectors/inventory.ts — the Inventory screen's derived list (SPEC §3.3).
// Shapes raw rows into typed, render-ready items and computes the low-stock flag
// per item plus the tenant's total low-stock count (the "Low Stock" pill badge,
// same rule as the nav badge: qty_on_hand <= low_stock_threshold, CLAUDE.md §5).
//
// Low-stock is a column-to-column comparison PostgREST can't express as a filter,
// so it's computed here in JS — inventory is a small per-tenant table. Money
// (unit cost) stays integer cents; nothing is formatted here (that's format.ts).

import "server-only";
import { cache } from "react";
import { listInventoryItems } from "@/lib/db/queries/inventory";
import { categoryOrder } from "@/lib/inventory-config";
import type { InventoryCategory, InventoryKind } from "@/lib/inventory-config";

export type InventoryListItem = {
  id: string;
  name: string;
  category: InventoryCategory;
  kind: InventoryKind;
  /**
   * Quantity on hand, or `null` when no stock figure could be read for the item
   * ("stock not yet set" — SPEC §3.3). Our schema defaults qty to 0 and is
   * non-null, so in practice this is a number; the null case is handled for
   * robustness and to honour the reference's no-stock-set state.
   */
  qtyOnHand: number | null;
  unit: string;
  lowStockThreshold: number;
  /** qty_on_hand <= low_stock_threshold (only meaningful when qty is set). */
  isLowStock: boolean;
  unitCostCents: number;
};

export type InventoryList = {
  items: InventoryListItem[];
  /** Count of low-stock items → the "Low Stock" pill badge. */
  lowStockCount: number;
  /** Distinct categories present, in enum order → the category filter. */
  categories: InventoryCategory[];
};

/** numeric columns can arrive as strings over the wire — coerce, or null. */
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function loadInventoryList(): Promise<InventoryList> {
  const rows = await listInventoryItems();

  const items: InventoryListItem[] = rows.map((r) => {
    const qtyOnHand = toNumberOrNull(r.qty_on_hand);
    const lowStockThreshold = toNumberOrNull(r.low_stock_threshold) ?? 0;
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      kind: r.kind,
      qtyOnHand,
      unit: r.unit,
      lowStockThreshold,
      isLowStock: qtyOnHand !== null && qtyOnHand <= lowStockThreshold,
      unitCostCents: r.unit_cost_cents,
    };
  });

  const lowStockCount = items.filter((i) => i.isLowStock).length;
  const categories = [...new Set(items.map((i) => i.category))].sort(
    (a, b) => categoryOrder(a) - categoryOrder(b),
  );

  return { items, lowStockCount, categories };
}

/** The Inventory list for this tenant. React-`cache()`d per request. */
export const getInventoryList = cache((): Promise<InventoryList> => loadInventoryList());
