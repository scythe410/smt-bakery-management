// format.ts — render-time formatting only. CLAUDE.md §3.
//
// Money is stored and computed as integer cents (see money.ts). It becomes a
// human string ONLY here, at the last moment before display. We never store a
// formatted string in the DB and never do money math on these strings.
//
// Target format: `LKR 12,345.00` — Arabic numerals, thousands grouped with a
// comma, dot decimal, always two fraction digits (Sri Lankan commercial
// standard; CLAUDE.md i18n note). Grouping is fixed to en-US so it is ALWAYS
// standard thousands (12,345), never lakh/crore grouping some locales apply.

import { toMajor } from "@/lib/money";

// Fixed formatter: standard thousands grouping, exactly 2 fraction digits.
// Reused (constructing Intl.NumberFormat per call is comparatively expensive).
const LKR_NUMBER = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

/**
 * Format integer cents as `LKR 12,345.00`.
 * Pass the same integer-cents values used everywhere else so the string always
 * matches the underlying figure exactly.
 */
export function formatLKR(cents: number): string {
  return `LKR ${LKR_NUMBER.format(toMajor(cents))}`;
}

/**
 * Amount without the currency prefix: `12,345.00`. For tables/columns where the
 * `LKR` unit sits in a header instead of repeating on every row. Pair with the
 * `tabular-nums` font feature (Tailwind `tabular-nums`) at the call site so
 * digits align in a column.
 */
export function formatAmount(cents: number): string {
  return LKR_NUMBER.format(toMajor(cents));
}
