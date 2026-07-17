// queries/menu.ts — raw, tenant-scoped menu reads. RLS-scoped (anon key), so
// results are always this tenant's rows; no derivation here. CLAUDE.md §4/§7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type MenuItemRow = Database["public"]["Tables"]["menu_item"]["Row"];
export type RecipeLineRow = Database["public"]["Tables"]["recipe_line"]["Row"];
export type InventoryItemRow = Database["public"]["Tables"]["inventory_item"]["Row"];

/**
 * Available menu items for the tenant (name A→Z) — the pickable products for the
 * new-order flow. `price_cents` here is the authoritative price the server uses
 * to recompute an order's total; the client never gets to set it (CLAUDE.md §7.7).
 */
export async function listAvailableMenuItems(): Promise<MenuItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_item")
    .select("*")
    .eq("is_available", true)
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Batch-sign private item-image object PATHs into short-lived URLs (the
 * `item-images` bucket is private, CLAUDE.md §7.8). Returns a path→signedUrl map;
 * paths that don't resolve (missing object, sign error) are simply omitted, so the
 * caller falls back to a placeholder tile — never a broken image (DESIGN.md §6).
 */
export async function signItemImageUrls(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  if (unique.length === 0) return map;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("item-images")
    .createSignedUrls(unique, 60 * 60);
  if (error || !data) return map;
  for (const row of data) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

/** All menu items (available + unavailable) ordered by item_code. */
export async function listAllMenuItems(): Promise<MenuItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("menu_item")
    .select("*")
    .order("item_code", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

/**
 * Menu items by id (RLS-scoped). The order action calls this to fetch the
 * AUTHORITATIVE name + price for the submitted lines — it never trusts a
 * client-sent price or name (CLAUDE.md §3/§7.7).
 */
export async function listMenuItemsByIds(ids: string[]): Promise<MenuItemRow[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("menu_item").select("*").in("id", ids);
  if (error) throw error;
  return data ?? [];
}

/**
 * Recipe lines for a single menu item, ordered by created_at so the editor
 * presents them in insertion order.
 */
export async function getRecipeLines(menuItemId: string): Promise<RecipeLineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_line")
    .select("*")
    .eq("menu_item_id", menuItemId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * All recipe lines for all menu items of this tenant — used to assemble the
 * full menu list (each item shows its BOM ingredient count).
 */
export async function listAllRecipeLines(): Promise<RecipeLineRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipe_line")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * INGREDIENT-kind inventory items only — the only valid BOM ingredients per
 * CLAUDE.md §4 FT1. Ordered by name.
 */
export async function listIngredientItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .select("*")
    .eq("kind", "ingredient")
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/**
 * Sold-from-stock inventory items — finished_good (produced) AND merchandise
 * (bought-in resale) — the valid targets for a menu item's tracked link per
 * CLAUDE.md §4. Ingredients (INPUTS) are excluded; they deduct via recipe_line.
 * Ordered by name.
 */
export async function listSoldFromStockItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .select("*")
    .in("kind", ["finished_good", "merchandise"])
    .order("name", { ascending: true });
  if (error) throw error;
  return data ?? [];
}
