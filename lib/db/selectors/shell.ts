// Shell badge counts — the live numbers the chrome shows: the header's unread
// notification count and the bottom-nav badges (Inventory low-stock, Menu
// attention). Server-only; every read goes through the RLS-scoped client, so
// counts are always this tenant's. React `cache()` dedupes the one fetch shared
// by the header and the nav within a request.

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type ShellBadges = {
  /** Unread notifications → header bell badge. */
  notificationsUnread: number;
  /** qty_on_hand <= low_stock_threshold → Inventory nav badge (CLAUDE.md §5). */
  inventoryLowStock: number;
  /** Menu items currently unavailable ("sold out") → Menu nav badge. */
  menuAttention: number;
};

export const getShellBadges = cache(async (): Promise<ShellBadges> => {
  const supabase = await createClient();

  const [notif, inventory, menu] = await Promise.all([
    // head + exact count: no rows transferred, just the number.
    supabase.from("notification").select("id", { count: "exact", head: true }).eq("is_read", false),
    // Low-stock is a column-to-column comparison PostgREST can't express as a
    // filter, so we pull just the two numeric columns for this tenant's items
    // and count in JS. Inventory is a small per-tenant table.
    supabase.from("inventory_item").select("qty_on_hand, low_stock_threshold"),
    supabase.from("menu_item").select("id", { count: "exact", head: true }).eq("is_available", false),
  ]);

  const inventoryLowStock = (inventory.data ?? []).filter(
    (row) => Number(row.qty_on_hand) <= Number(row.low_stock_threshold),
  ).length;

  return {
    notificationsUnread: notif.count ?? 0,
    inventoryLowStock,
    menuAttention: menu.count ?? 0,
  };
});
