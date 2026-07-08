// queries/pricing.ts — raw reads for the two "reference" tables that turn order
// rows into money: commission rules (platform cut per source) and the recipe
// BOM + ingredient costs (COGS per menu item). RLS-scoped; no derivation here.
// CLAUDE.md §4, §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type CommissionRuleRow = Database["public"]["Tables"]["commission_rule"]["Row"];

/** Every commission rule for the tenant (one per order source). */
export async function listCommissionRules(): Promise<CommissionRuleRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("commission_rule").select("*");
  if (error) throw error;
  return data ?? [];
}

/** A recipe line joined to just the cost it contributes. */
export type RecipeCostLine = {
  menu_item_id: string;
  /** Quantity of the ingredient per one unit sold (in the ingredient's unit). */
  qty: number;
  /** Cost per ingredient unit, integer cents. */
  unit_cost_cents: number;
};

/**
 * Recipe lines with each ingredient's unit cost, for COGS derivation. Returned
 * raw (one row per BOM line); the selector rolls these up per menu item and
 * rounds to whole cents. Both tables are small and per-tenant.
 */
export async function listRecipeCostLines(): Promise<RecipeCostLine[]> {
  const supabase = await createClient();

  const [recipes, inventory] = await Promise.all([
    supabase.from("recipe_line").select("menu_item_id, inventory_item_id, qty"),
    supabase.from("inventory_item").select("id, unit_cost_cents"),
  ]);

  if (recipes.error) throw recipes.error;
  if (inventory.error) throw inventory.error;

  const costById = new Map<string, number>();
  for (const item of inventory.data ?? []) costById.set(item.id, item.unit_cost_cents);

  return (recipes.data ?? []).map((line) => ({
    menu_item_id: line.menu_item_id,
    qty: Number(line.qty),
    unit_cost_cents: costById.get(line.inventory_item_id) ?? 0,
  }));
}
