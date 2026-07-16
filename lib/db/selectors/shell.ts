// Shell badge counts — unread notifications (header bell) and nav badges
// (Inventory low-stock, Menu attention). Served from a per-tenant data cache;
// React cache() dedupes the one call shared by the header and the nav.

import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getProfile } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { businessTags } from "@/lib/db/cache";

export type ShellBadges = {
  /** Unread notifications → header bell badge. */
  notificationsUnread: number;
  /**
   * Finished goods at/below their reorder threshold → production alerts
   * ("make another batch"). Derived from current stock, so it is inherently
   * deduped (one per item); folded into the header bell count (CLAUDE.md §4 FT3).
   */
  productionAlerts: number;
  /** qty_on_hand <= low_stock_threshold → Inventory nav badge (CLAUDE.md §5). */
  inventoryLowStock: number;
  /** Menu items currently unavailable ("sold out") → Menu nav badge. */
  menuAttention: number;
};

const EMPTY_BADGES: ShellBadges = {
  notificationsUnread: 0,
  productionAlerts: 0,
  inventoryLowStock: 0,
  menuAttention: 0,
};

function loadShellBadges(businessId: string): Promise<ShellBadges> {
  return unstable_cache(
    async (): Promise<ShellBadges> => {
      const supabase = createServiceClient();

      const [notif, production, lowStock, menu] = await Promise.all([
        // head + exact count: no rows transferred, just the number.
        supabase
          .from("notification")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("is_read", false),
        // Production alerts: finished goods at/below threshold. The
        // production_alert view applies the column-vs-column rule; a head count
        // returns just the number (CLAUDE.md §4 FT3). Reads inventory_item, so the
        // `inventory` cache tag below already invalidates it on a produce/sale.
        supabase
          .from("production_alert")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        // Low-stock (qty_on_hand <= low_stock_threshold) is a column-vs-column
        // comparison PostgREST can't express as a filter, so it lives in the
        // inventory_low_stock view; a head count returns just the number — no
        // per-item rows pulled to JS (MED-4).
        supabase
          .from("inventory_low_stock")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId),
        supabase
          .from("menu_item")
          .select("id", { count: "exact", head: true })
          .eq("business_id", businessId)
          .eq("is_available", false),
      ]);

      return {
        notificationsUnread: notif.count ?? 0,
        productionAlerts: production.count ?? 0,
        inventoryLowStock: lowStock.count ?? 0,
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
