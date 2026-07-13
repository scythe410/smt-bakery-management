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
 * rounds to whole cents.
 *
 * The recipe_line ⋈ inventory_item join is done in the database via the
 * recipe_cost_line view (one round trip instead of two reads + a JS join — MED-7).
 * The view LEFT JOINs + coalesces to 0, so the output is identical to the old JS
 * path (a line whose ingredient is missing contributes cost 0, not a dropped row)
 * — COGS / Est. Net Profit reconcile unchanged. `scope` → cached service read
 * (explicit business_id); omitted → RLS server client.
 */
export async function listRecipeCostLines(scope?: DbScope): Promise<RecipeCostLine[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase.from("recipe_cost_line").select("menu_item_id, qty, unit_cost_cents");
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((line) => ({
    menu_item_id: line.menu_item_id as string,
    qty: Number(line.qty ?? 0),
    unit_cost_cents: Number(line.unit_cost_cents ?? 0),
  }));
}
