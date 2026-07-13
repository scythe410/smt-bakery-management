// Shared helpers for the bounded, DB-filtered list screens (Orders, Bookings).
// One page size and one search sanitiser so both screens paginate and match text
// identically. See queries/orders.ts and queries/bookings.ts.

/**
 * Rows per page for the list screens. The query fetches PAGE_SIZE + 1 rows to
 * learn whether a further page exists, then returns at most PAGE_SIZE — so the
 * transferred set is always bounded regardless of how many rows the tenant has.
 */
export const LIST_PAGE_SIZE = 20;

/**
 * Make a user search string safe to interpolate into a PostgREST `ilike`
 * pattern inside an `.or(...)` filter. Strips the characters that carry meaning
 * in that grammar — the `%`/`_` wildcards and the `,`/`(`/`)`/`*`/`"`/`\`
 * delimiters — so the term is matched literally and can't break out of the
 * filter. (This is a PostgREST-grammar concern, not SQL injection; the driver
 * still parameterises the value.) Returns "" when nothing usable remains, which
 * callers treat as "no search".
 */
export function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_,()*"\\]/g, "").trim();
}
