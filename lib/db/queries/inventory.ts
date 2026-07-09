// queries/inventory.ts — raw, tenant-scoped inventory reads.
//
// Every read goes through the RLS-scoped server client (anon key), so results
// are always this tenant's rows only — no `.eq('business_id', …)` needed and no
// way to spoof another tenant (CLAUDE.md §7.1/§7.2). No derivation here: rows in,
// rows out. Low-stock tallying + shaping lives in lib/db/selectors/inventory.ts.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type InventoryItemRow = Database["public"]["Tables"]["inventory_item"]["Row"];

/** All inventory items for this tenant, ordered by name (A→Z). */
export async function listInventoryItems(): Promise<InventoryItemRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_item")
    .select("*")
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
