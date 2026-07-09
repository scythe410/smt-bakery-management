// queries/menu.ts — raw, tenant-scoped menu reads. RLS-scoped (anon key), so
// results are always this tenant's rows; no derivation here. CLAUDE.md §4/§7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type MenuItemRow = Database["public"]["Tables"]["menu_item"]["Row"];

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
