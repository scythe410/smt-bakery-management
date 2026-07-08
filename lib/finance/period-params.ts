// Finance period ↔ URL params. Client-safe (no server-only): the page (server)
// parses the current params into a PeriodInput, and the PeriodSelector (client)
// builds URLs from the same option list — one source of truth for both.

import type { PeriodInput } from "@/lib/db/period";

export const PERIOD_KINDS = ["today", "week", "month", "custom"] as const;
export type PeriodKindParam = (typeof PERIOD_KINDS)[number];

/** Default when no/invalid period is in the URL (SPEC §3.2: "This Month"). */
export const DEFAULT_PERIOD_KIND: PeriodKindParam = "month";

/**
 * Resolve URL params into a PeriodInput. Custom requires both `from` and `to`
 * (else it falls back to the default), so a half-entered custom range never
 * produces a broken query.
 */
export function periodInputFromParams(params: {
  period?: string;
  from?: string;
  to?: string;
}): PeriodInput {
  const kind = params.period;
  if (kind === "today" || kind === "week" || kind === "month") return { kind };
  if (kind === "custom" && params.from && params.to) {
    return { kind: "custom", from: params.from, to: params.to };
  }
  return { kind: "month" };
}
