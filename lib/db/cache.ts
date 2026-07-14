// cache.ts — the data-cache vocabulary shared by the cached read selectors and
// the mutations that invalidate them (CLAUDE.md §2 "internally consistent").
//
// WHY a data cache: every figure on Dashboard / Finance / Reports is derived
// from the same rows on every request, across the region gap, with no cache
// (cache=MISS on 100% of hits). These figures change ONLY on a write, so we
// cache the derived result per tenant (+ period) and invalidate exactly the
// tags a given mutation touches — repeat navigations become instant while the
// numbers stay correct.
//
// Tags are scoped by business_id, so invalidating one tenant never dumps
// another tenant's cache. Identity (auth.getUser / profile) is deliberately
// NOT cached here — only derived business data with explicit invalidation.

import "server-only";
import { updateTag } from "next/cache";
import type { ServiceClient } from "@/lib/supabase/service";

/**
 * The tenant scope handed to a cached read: a non-cookie service client paired
 * with the business_id every one of its queries MUST filter by. The pairing is
 * the safety mechanism — a service-role read can never run without its explicit
 * `.eq("business_id", …)` because you only get the client alongside the id.
 */
export type DbScope = { client: ServiceClient; businessId: string };

/** One data source ⇒ one tag family, keyed by business_id. */
export const businessTags = {
  /** `order` + `order_item` rows (sales, commission, COGS base). */
  orders: (b: string) => `orders:${b}`,
  /** `expense` rows. */
  expenses: (b: string) => `expenses:${b}`,
  /** `booking` rows (booking revenue / pipeline). */
  bookings: (b: string) => `bookings:${b}`,
  /** `inventory_item` rows (stock list + low-stock badge). */
  inventory: (b: string) => `inventory:${b}`,
  /** `menu_item` rows (availability / "sold out" badge). */
  menu: (b: string) => `menu:${b}`,
  /** `notification` rows (unread bell badge). */
  notifications: (b: string) => `notifications:${b}`,
  /** `stock_day` + `stock_count_line` rows (daily merchandise count / End-of-Day). */
  stock: (b: string) => `stock:${b}`,
  /** `commission_rule` + `recipe_line` + ingredient costs (drive commission & COGS). */
  pricing: (b: string) => `pricing:${b}`,
  /** the `business` row itself (name, logo, timezone, tax config). */
  business: (b: string) => `business:${b}`,
} as const;

export type BusinessTagKey = keyof typeof businessTags;

/**
 * Invalidate the given tag families for one tenant. Call from a SERVER ACTION
 * after a successful write, naming exactly the data it changed. Uses `updateTag`
 * (immediate expiration + read-your-own-writes), so the acting user's next render
 * sees the fresh figures — not a stale cached total. (updateTag is Server-Action
 * only; that matches every mutation call site.)
 */
export function revalidateBusinessTags(businessId: string, keys: readonly BusinessTagKey[]): void {
  for (const key of keys) updateTag(businessTags[key](businessId));
}
