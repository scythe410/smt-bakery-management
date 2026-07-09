// Reports type + date ↔ URL params. Client-safe (no server-only): the page
// (server) parses the current params, and ReportControls (client) builds URLs
// from the same lists — one source of truth for both. The report type is an
// extensible enum: today only "daily_sales" ships, but the list, the labels
// (i18n `reports.type.*`), and the switch below are all keyed off it, so adding
// a report type is additive, not a rewrite (CLAUDE.md §5 "extend, don't
// hardcode").

import type { PeriodInput } from "@/lib/db/period";

export const REPORT_TYPES = ["daily_sales"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

/** Default when no/invalid type is in the URL. */
export const DEFAULT_REPORT_TYPE: ReportType = "daily_sales";

/** Narrow an arbitrary string to a known report type, else the default. */
export function toReportType(value: string | undefined): ReportType {
  return REPORT_TYPES.includes(value as ReportType) ? (value as ReportType) : DEFAULT_REPORT_TYPE;
}

/** True for a well-formed `YYYY-MM-DD` calendar date string. */
export function isDateStr(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const t = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(t.getTime());
}

/**
 * A single day expressed as a period: Daily Sales reports one calendar day, so
 * both bounds of the custom window are that date. Resolved against the tenant
 * timezone downstream (resolveTenantPeriod), same as every other screen.
 */
export function singleDayPeriod(date: string): PeriodInput {
  return { kind: "custom", from: date, to: date };
}
