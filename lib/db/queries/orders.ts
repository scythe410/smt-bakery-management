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
import type { DbScope } from "@/lib/db/cache";
import { LIST_PAGE_SIZE, sanitizeSearch } from "@/lib/db/list";
import type { OrderSource, OrderStatus, PaymentMethod } from "@/lib/orders/order-config";

export type OrderRow = Database["public"]["Tables"]["order"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_item"]["Row"];

/** An order plus its snapshot line items — enough to derive revenue AND COGS. */
export type OrderWithItems = OrderRow & { order_item: OrderItemRow[] };

/**
 * Orders whose `created_at` falls in the period's half-open [start, end)
 * instant range, each with its line items embedded. The window is the tenant's
 * wall-clock day (see lib/db/period.ts), so "today" means today for the shop.
 */
// `scope` is passed by cached selectors: a service client + business_id, which
// bypasses RLS, so we filter business_id explicitly (see lib/db/cache.ts). Without
// it, the RLS server client scopes the tenant automatically (the uncached path).
export async function listOrdersWithItems(
  period: Period,
  scope?: DbScope,
): Promise<OrderWithItems[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("order")
    .select("*, order_item(*)")
    .gte("created_at", period.startUtc)
    .lt("created_at", period.endUtc)
    .order("created_at", { ascending: true });
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as OrderWithItems[];
}

/**
 * The Active/Archived tabs + source/status/payment/date/search filters for the
 * Orders screen, resolved to database predicates. `statuses` is the tab's status
 * set; `status` (if set) further narrows within it. `dateStartUtc/dateEndUtc` are
 * the selected local day's half-open instant range (the caller converts the local
 * date in the tenant timezone). All fields optional ⇒ default (unfiltered) list.
 */
export type OrderListFilters = {
  statuses?: readonly OrderStatus[];
  source?: OrderSource | null;
  status?: OrderStatus | null;
  payment?: PaymentMethod | null;
  dateStartUtc?: string | null;
  dateEndUtc?: string | null;
  search?: string | null;
};

export type OrdersPage = {
  rows: OrderWithItems[];
  /** True when at least one more page exists after this one. */
  hasMore: boolean;
};

/**
 * One bounded page of this tenant's orders (newest first), each with its line
 * items — the Orders screen's source data (SPEC §3.4). Filtering + pagination run
 * in the DATABASE, not over a full client-side pull: the tab/source/status/
 * payment/date/search filters are SQL predicates and the window is `.range()`d, so
 * the transferred set is always ≤ one page (Antigravity HIGH-1). RLS-scoped, so it
 * is always this tenant's orders. Ordered by (created_at desc, id desc) — a stable
 * total order over the `(business_id, created_at desc)` index, so pages don't
 * overlap when timestamps tie.
 */
export async function listOrdersPage(
  filters: OrderListFilters,
  page: number,
  pageSize: number = LIST_PAGE_SIZE,
): Promise<OrdersPage> {
  const supabase = await createClient();
  const from = Math.max(0, page) * pageSize;

  let query = supabase
    .from("order")
    .select("*, order_item(*)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (filters.statuses && filters.statuses.length > 0) {
    query = query.in("status", filters.statuses as OrderStatus[]);
  }
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.source) query = query.eq("source", filters.source);
  if (filters.payment) query = query.eq("payment_method", filters.payment);
  if (filters.dateStartUtc) query = query.gte("created_at", filters.dateStartUtc);
  if (filters.dateEndUtc) query = query.lt("created_at", filters.dateEndUtc);

  const search = filters.search ? sanitizeSearch(filters.search) : "";
  if (search) {
    query = query.or(`order_no.ilike.%${search}%,customer_name.ilike.%${search}%`);
  }

  // Fetch one extra row to detect a further page without a separate count query.
  const { data, error } = await query.range(from, from + pageSize);
  if (error) throw error;

  const rows = (data ?? []) as OrderWithItems[];
  const hasMore = rows.length > pageSize;
  return { rows: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}

/**
 * A single order with its line items — the bill/receipt data source.
 * RLS-scoped (anon key), so it will only return orders belonging to the
 * authenticated user's tenant. Returns null when the id doesn't exist or
 * belongs to another tenant.
 */
export async function getOrderWithItems(orderId: string): Promise<OrderWithItems | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("order")
    .select("*, order_item(*)")
    .eq("id", orderId)
    .maybeSingle();
  if (error) throw error;
  return data as OrderWithItems | null;
}

/**
 * Exact counts of this tenant's orders whose status falls in each given set —
 * the Active/Archived tab badges. Head-only `count: 'exact'` per set: no rows
 * transferred, just the numbers. RLS-scoped.
 */
export async function countOrdersByStatuses(
  sets: Record<string, readonly OrderStatus[]>,
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const entries = Object.entries(sets);
  const results = await Promise.all(
    entries.map(([, statuses]) =>
      supabase
        .from("order")
        .select("id", { count: "exact", head: true })
        .in("status", statuses as OrderStatus[]),
    ),
  );
  const out: Record<string, number> = {};
  entries.forEach(([key], i) => {
    const { count, error } = results[i];
    if (error) throw error;
    out[key] = count ?? 0;
  });
  return out;
}
