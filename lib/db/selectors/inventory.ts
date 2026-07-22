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
import {
  listInventoryItems,
  listFinishedGoodItems,
  listReturnMovements,
} from "@/lib/db/queries/inventory";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
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
  /**
   * Retail selling price (sold-from-stock kinds), or null when unset — the
   * scan-to-bill flow can't sell the item until this is set, so the list
   * surfaces it with an inline editor. Always null for ingredients.
   */
  salePriceCents: number | null;
  /** Stored barcode (GTIN/QR), or null — lets the scanner spot a re-scan. */
  barcode: string | null;
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
      salePriceCents: r.sale_price_cents,
      barcode: r.barcode,
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

// --- Production view (finished-good lane, CLAUDE.md §4 FT3) ------------------

export type FinishedGood = {
  id: string;
  name: string;
  /** Units currently in stock (produced − sold). May be negative (stock lies). */
  qtyOnHand: number;
  unit: string;
  /** Reorder point: qty_on_hand <= threshold ⇒ a production alert. */
  lowStockThreshold: number;
  /** qty_on_hand <= low_stock_threshold — same rule as the production_alert view. */
  needsBatch: boolean;
  /**
   * End-of-day leftover = units still on hand (max(qtyOnHand, 0); negative stock
   * has nothing to return). This is what the Return control pulls from stock.
   */
  leftoverQty: number;
  /** leftoverQty × unit_cost_cents — cash cost of the leftover (insight, not revenue). */
  leftoverValueCents: number;
  /** Units already RETURNED today (Σ magnitude of today's `return` movements). */
  returnedTodayQty: number;
};

export type ProductionView = {
  /** All finished goods (name A→Z) — the produce-batch list. */
  items: FinishedGood[];
  /** The subset at/below threshold — the "make another batch" alerts. */
  alerts: FinishedGood[];
  /** Σ leftoverQty over all finished goods — the leftover report total. */
  totalLeftoverQty: number;
  /** Σ leftoverValueCents — total cash value of end-of-day leftovers (owner insight). */
  totalLeftoverValueCents: number;
  /** Σ returnedTodayQty — total units returned/wasted today. */
  totalReturnedTodayQty: number;
};

async function loadProductionView(): Promise<ProductionView> {
  // Today (tenant timezone) for the returned-today tally — the leftover report is
  // an end-of-day view, so "returned today" scopes to the shop's current day.
  const today = await resolveTenantPeriod({ kind: "today" });
  const [rows, returnedByItem] = await Promise.all([
    listFinishedGoodItems(),
    listReturnMovements(today),
  ]);

  const items: FinishedGood[] = rows.map((r) => {
    const qtyOnHand = toNumberOrNull(r.qty_on_hand) ?? 0;
    const lowStockThreshold = toNumberOrNull(r.low_stock_threshold) ?? 0;
    const leftoverQty = Math.max(qtyOnHand, 0);
    const unitCostCents = toNumberOrNull(r.unit_cost_cents) ?? 0;
    return {
      id: r.id,
      name: r.name,
      qtyOnHand,
      unit: r.unit,
      lowStockThreshold,
      needsBatch: qtyOnHand <= lowStockThreshold,
      leftoverQty,
      leftoverValueCents: Math.round(leftoverQty * unitCostCents),
      returnedTodayQty: returnedByItem.get(r.id) ?? 0,
    };
  });

  return {
    items,
    alerts: items.filter((i) => i.needsBatch),
    totalLeftoverQty: items.reduce((n, i) => n + i.leftoverQty, 0),
    totalLeftoverValueCents: items.reduce((n, i) => n + i.leftoverValueCents, 0),
    totalReturnedTodayQty: items.reduce((n, i) => n + i.returnedTodayQty, 0),
  };
}

/** The Production view for this tenant. React-`cache()`d per request. */
export const getProductionView = cache((): Promise<ProductionView> => loadProductionView());
