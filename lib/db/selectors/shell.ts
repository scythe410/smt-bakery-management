// Shell badge counts — the live numbers the chrome shows: the header's unread
// notification count and the bottom-nav badges (Inventory low-stock, Menu
// attention). Server-only.
//
// Identity is resolved first (getProfile → business_id, uncached RLS read), then
// the counts are served from a per-tenant data cache keyed by business_id and
// tagged notifications/inventory/menu, so repeat navigations don't re-query
// across the region gap. Writes to those tables invalidate the matching tag (see
// lib/db/cache.ts). The cached read uses the service client, so every query is
// filtered by the server-resolved business_id (never client input). React
// `cache()` still dedupes the one call shared by the header and the nav.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessTags } from "@/lib/db/cache";

export type ShellBadges = {
  /** Unread notifications → header bell badge. */
  notificationsUnread: number;
  /** qty_on_hand <= low_stock_threshold → Inventory nav badge (CLAUDE.md §5). */
  inventoryLowStock: number;
  /** Menu items currently unavailable ("sold out") → Menu nav badge. */
  menuAttention: number;
};

const EMPTY_BADGES: ShellBadges = {
  notificationsUnread: 0,
  inventoryLowStock: 0,
  menuAttention: 0,
};

function loadShellBadges(businessId: string): Promise<ShellBadges> {
  return unstable_cache(
    async (): Promise<ShellBadges> => {
      const supabase = createServiceClient();

      const [notif, inventory, menu] = await Promise.all([
        // head + exact count: no rows transferred, just the number.
        supabase
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("is_read", false),
        // Low-stock is a column-to-column comparison PostgREST can't express as a
        // filter, so we pull just the two numeric columns for this tenant's items
        // and count in JS. Inventory is a small per-tenant table.
        supabase
          .from("inventory_item")
          .select("qty_on_hand, low_stock_threshold")
          .eq("business_id", businessId),
        supabase
          .from("menu_item")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("is_available", false),
      ]);

      const inventoryLowStock = (inventory.data ?? []).filter(
        (row) => Number(row.qty_on_hand) <= Number(row.low_stock_threshold),
      ).length;

      return {
        notificationsUnread: notif.count ?? 0,
        inventoryLowStock,
        menuAttention: menu.count ?? 0,
      };
    },
    ["shell-badges", businessId],
    {
      tags: [
        businessTags.notifications(businessId),
        businessTags.inventory(businessId),
        businessTags.menu(businessId),
      ],
      revalidate: 3600,
    },
  )();
}

export const getShellBadges = cache(async (): Promise<ShellBadges> => {
  const profile = await getProfile();
  if (!profile?.business_id) return EMPTY_BADGES;
  return loadShellBadges(profile.business_id);
});
