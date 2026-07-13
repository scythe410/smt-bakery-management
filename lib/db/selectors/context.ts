// selectors/context.ts — resolve a requested period against the tenant's own
// timezone, so callers pass an intent ("this week") and get concrete bounds
// without touching the business row themselves.

import "server-only";
import { getBusiness } from "@/lib/auth";
import { resolvePeriod, type Period, type PeriodInput } from "@/lib/db/period";

/** Fallback matches the seed tenant; only used if a business somehow lacks one. */
const DEFAULT_TIMEZONE = "Asia/Colombo";

/** Resolve a period in the current tenant's timezone (getBusiness is cached). */
export async function resolveTenantPeriod(input: PeriodInput): Promise<Period> {
  const business = await getBusiness();
  return resolvePeriod(input, business?.timezone || DEFAULT_TIMEZONE);
}

/**
 * Like {@link resolveTenantPeriod}, but also returns the tenant id — the key the
 * cached money selectors need to scope + tag their data cache. `businessId` is
 * null only when signed out / unassigned (the auth gate makes that unreachable in
 * practice), in which case callers return an empty result. getBusiness is cached,
 * so this shares the shell's business read (no extra round trip).
 */
export async function resolveTenantPeriodScope(
  input: PeriodInput,
): Promise<{ period: Period; businessId: string | null }> {
  const business = await getBusiness();
  const period = resolvePeriod(input, business?.timezone || DEFAULT_TIMEZONE);
  return { period, businessId: business?.id ?? null };
}

/** Stable cache-key fragment for a resolved period (fully identifies its effect). */
export function periodCacheKey(period: Period): string {
  return `${period.startUtc}|${period.endUtc}|${period.timezone}`;
}
