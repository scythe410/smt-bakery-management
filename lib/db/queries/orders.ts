// queries/orders.ts — raw, tenant-scoped order reads.
//
// Every read goes through the RLS-scoped server client (anon key), so results
// are always this tenant's rows only — no `.eq('business_id', …)` needed and no
// way to spoof another tenant (CLAUDE.md §7.1/§7.2). These functions do NO
// derivation: they return rows. All aggregation lives in lib/db/selectors.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";

export type OrderRow = Database["public"]["Tables"]["order"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_item"]["Row"];

/** An order plus its snapshot line items — enough to derive revenue AND COGS. */
export type OrderWithItems = OrderRow & { order_item: OrderItemRow[] };

/**
 * Orders whose `created_at` falls in the period's half-open [start, end)
 * instant range, each with its line items embedded. The window is the tenant's
 * wall-clock day (see lib/db/period.ts), so "today" means today for the shop.
 */
export async function listOrdersWithItems(period: Period): Promise<OrderWithItems[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order")
    .select("*, order_item(*)")
    .gte("created_at", period.startUtc)
    .lt("created_at", period.endUtc)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data ?? []) as OrderWithItems[];
}
