// Reports type + date ↔ URL params. Client-safe (no server-only): the page
// (server) parses the current params, and ReportControls (client) builds URLs
// from the same lists — one source of truth for both. The report type is an
// extensible enum ("daily_sales" and "end_of_day" ship today); the list, the
// labels (i18n `reports.type.*`), and the page's switch are all keyed off it, so
// adding a report type is additive, not a rewrite (CLAUDE.md §5 "extend, don't
// hardcode").

import type { PeriodInput } from "@/lib/db/period";

export const REPORT_TYPES = ["daily_sales", "end_of_day", "salaries"] as const;
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

// ── Salaries report period ranges ────────────────────────────────────────────
// The Salaries report is reviewed over a window, not a single day: Day / Week /
// Month around an anchor date, or a fully Custom from–to. We resolve the range to
// concrete `YYYY-MM-DD` bounds here (pure calendar math on the anchor date) and
// hand a `custom` PeriodInput downstream — salary_payment.pay_date is a plain
// `date` column, so only the local calendar bounds matter (same as expense.date).

export const SALARY_RANGES = ["day", "week", "month", "custom"] as const;
export type SalaryRange = (typeof SALARY_RANGES)[number];

/** Default when no/invalid range is in the URL. Payroll is reviewed by month. */
export const DEFAULT_SALARY_RANGE: SalaryRange = "month";

export function toSalaryRange(value: string | undefined): SalaryRange {
  return SALARY_RANGES.includes(value as SalaryRange)
    ? (value as SalaryRange)
    : DEFAULT_SALARY_RANGE;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Inclusive `{ from, to }` calendar bounds for a salary range around `date`.
 * Week starts Monday (ISO 8601, matching period.ts). `custom` uses the explicit
 * from/to (falling back to the anchor date, and swapped if reversed).
 */
export function salaryPeriodBounds(
  range: SalaryRange,
  date: string,
  from: string | undefined,
  to: string | undefined,
): { from: string; to: string } {
  if (range === "custom") {
    const f = isDateStr(from) ? from : date;
    const t = isDateStr(to) ? to : date;
    return f <= t ? { from: f, to: t } : { from: t, to: f };
  }
  if (range === "day") return { from: date, to: date };

  const d = new Date(`${date}T00:00:00Z`);
  if (range === "week") {
    const mondayOffset = (d.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
    const start = new Date(d);
    start.setUTCDate(d.getUTCDate() - mondayOffset);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    return { from: isoDay(start), to: isoDay(end) };
  }
  // month
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  return { from: isoDay(start), to: isoDay(end) };
}

/** Salary range bounds expressed as a `custom` PeriodInput for the selectors. */
export function salaryPeriod(
  range: SalaryRange,
  date: string,
  from: string | undefined,
  to: string | undefined,
): PeriodInput {
  const bounds = salaryPeriodBounds(range, date, from, to);
  return { kind: "custom", from: bounds.from, to: bounds.to };
}
