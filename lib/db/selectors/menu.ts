// selectors/menu.ts — the Menu screen's derived list.
// Joins menu items with their recipe line counts so the list row can show
// "N ingredients" without a separate query per item. Money stays integer cents;
// nothing is formatted here.

import "server-only";
import { cache } from "react";
import {
  listAllMenuItems,
  listAllRecipeLines,
  listIngredientItems,
  listSoldFromStockItems,
  signItemImageUrls,
} from "@/lib/db/queries/menu";
import type { InventoryItemRow } from "@/lib/db/queries/menu";
import type { InventoryKind } from "@/lib/inventory-config";

export type MenuItem = {
  id: string;
  name: string;
  itemCode: number;
  priceCents: number;
  category: string | null;
  /** Stored object PATH in the private item-images bucket (presence check + form). */
  imageUrl: string | null;
  /** Short-lived SIGNED URL of the photo for the list thumbnail, or null. */
  thumbUrl: string | null;
  isAvailable: boolean;
  recipeLineCount: number;
  /** Linked finished_good (sold-from-stock), or null when made-to-order. */
  trackedInventoryItemId: string | null;
  createdAt: string;
};

export type IngredientOption = {
  id: string;
  name: string;
  unit: string;
};

/** An item pickable as a menu item's sold-from-stock link (finished_good or
 *  merchandise). `kind` labels which lane it is. */
export type SoldFromStockOption = {
  id: string;
  name: string;
  unit: string;
  kind: InventoryKind;
};

export type MenuList = {
  items: MenuItem[];
  unavailableCount: number;
  categories: string[];
};

async function loadMenuList(): Promise<MenuList> {
  const [rows, lines] = await Promise.all([listAllMenuItems(), listAllRecipeLines()]);

  // Count recipe lines per menu item.
  const lineCounts = new Map<string, number>();
  for (const l of lines) {
    lineCounts.set(l.menu_item_id, (lineCounts.get(l.menu_item_id) ?? 0) + 1);
  }

  // Sign photos for the list thumbnails — the item-images bucket is private, so a
  // stored PATH must be signed to render (CLAUDE.md §7.8). Batched, one round-trip;
  // unresolved paths are simply absent → the row shows the code chip, never a broken
  // image. This is the visual confirmation that a CF1 upload landed.
  const signedByPath = await signItemImageUrls(
    rows.map((r) => r.image_url).filter((p): p is string => p != null),
  );

  const items: MenuItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    itemCode: r.item_code,
    priceCents: r.price_cents,
    category: r.category,
    imageUrl: r.image_url,
    thumbUrl: r.image_url ? (signedByPath.get(r.image_url) ?? null) : null,
    isAvailable: r.is_available,
    recipeLineCount: lineCounts.get(r.id) ?? 0,
    trackedInventoryItemId: r.tracked_inventory_item_id,
    createdAt: r.created_at,
  }));

  const unavailableCount = items.filter((i) => !i.isAvailable).length;
  const categories = [...new Set(items.map((i) => i.category).filter(Boolean) as string[])].sort();

  return { items, unavailableCount, categories };
}

/** The Menu list for this tenant. React-`cache()`d per request. */
export const getMenuList = cache((): Promise<MenuList> => loadMenuList());

/** INGREDIENT-kind inventory items for the recipe editor. */
export async function getIngredientOptions(): Promise<IngredientOption[]> {
  const rows: InventoryItemRow[] = await listIngredientItems();
  return rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit }));
}

/** Sold-from-stock items (finished_good + merchandise) for the menu item's tracked
 *  selector. */
export async function getSoldFromStockOptions(): Promise<SoldFromStockOption[]> {
  const rows: InventoryItemRow[] = await listSoldFromStockItems();
  return rows.map((r) => ({ id: r.id, name: r.name, unit: r.unit, kind: r.kind }));
}
