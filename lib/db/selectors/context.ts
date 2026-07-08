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
