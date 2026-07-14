// selectors/menu.ts — the Menu screen's derived list.
// Joins menu items with their recipe line counts so the list row can show
// "N ingredients" without a separate query per item. Money stays integer cents;
// nothing is formatted here.

import "server-only";
import { cache } from "react";
import { listAllMenuItems, listAllRecipeLines, listIngredientItems } from "@/lib/db/queries/menu";
import type { InventoryItemRow } from "@/lib/db/queries/menu";

export type MenuItem = {
  id: string;
  name: string;
  itemCode: number;
  priceCents: number;
  category: string | null;
  imageUrl: string | null;
  isAvailable: boolean;
  recipeLineCount: number;
  createdAt: string;
};

export type IngredientOption = {
  id: string;
  name: string;
  unit: string;
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

  const items: MenuItem[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    itemCode: r.item_code,
    priceCents: r.price_cents,
    category: r.category,
    imageUrl: r.image_url,
    isAvailable: r.is_available,
    recipeLineCount: lineCounts.get(r.id) ?? 0,
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
