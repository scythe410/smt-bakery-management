// queries/pricing.ts — raw reads for the two "reference" tables that turn order
// rows into money: commission rules (platform cut per source) and the recipe
// BOM + ingredient costs (COGS per menu item). RLS-scoped; no derivation here.
// CLAUDE.md §4, §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { DbScope } from "@/lib/db/cache";

export type CommissionRuleRow = Database["public"]["Tables"]["commission_rule"]["Row"];

/**
 * Every commission rule for the tenant (one per order source). `scope` → cached
 * service read (explicit business_id); omitted → RLS server client.
 */
export async function listCommissionRules(scope?: DbScope): Promise<CommissionRuleRow[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase.from("commission_rule").select("*");
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
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
export async function listRecipeCostLines(scope?: DbScope): Promise<RecipeCostLine[]> {
  const supabase = scope?.client ?? (await createClient());

  // Both reads must be business-scoped when using the service client; the RLS
  // client scopes them itself. (join-by-id below is intra-tenant either way.)
  const recipeQuery = supabase.from("recipe_line").select("menu_item_id, inventory_item_id, qty");
  const inventoryQuery = supabase.from("inventory_item").select("id, unit_cost_cents");
  const [recipes, inventory] = await Promise.all([
    scope ? recipeQuery.eq("business_id", scope.businessId) : recipeQuery,
    scope ? inventoryQuery.eq("business_id", scope.businessId) : inventoryQuery,
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
