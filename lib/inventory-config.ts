// Inventory enums as client-safe config (SPEC §3.3 / CLAUDE.md §4). `category`
// and `kind` are Postgres enums, so — unlike free-text expense categories —
// these are a fixed set. Kept here (no `server-only`) so the list filter, the
// add-item form, and the Zod schema share ONE ordered source of truth. The
// values are enum keys; their display labels come from i18n (`inventory.category.*`
// / `inventory.kind.*`), so nothing user-facing is hardcoded (CLAUDE.md §3).

import type { Database } from "@/lib/supabase/types";

export type InventoryCategory = Database["public"]["Enums"]["inventory_category"];
export type InventoryKind = Database["public"]["Enums"]["inventory_kind"];

// Order is deliberate — drives the category filter and the add-item dropdown.
export const INVENTORY_CATEGORIES: readonly InventoryCategory[] = [
  "baking",
  "beverages",
  "syrups_toppings",
  "merch",
  "other",
] as const;

export const INVENTORY_KINDS: readonly InventoryKind[] = ["ingredient", "merchandise"] as const;

/** Sort key so a set of present categories renders in the fixed enum order. */
export function categoryOrder(category: InventoryCategory): number {
  const i = INVENTORY_CATEGORIES.indexOf(category);
  return i === -1 ? INVENTORY_CATEGORIES.length : i;
}
