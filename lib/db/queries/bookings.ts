// queries/bookings.ts — raw, tenant-scoped booking reads. RLS-scoped; no
// derivation here (see lib/db/selectors). CLAUDE.md §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";
import type { DbScope } from "@/lib/db/cache";
import { LIST_PAGE_SIZE, sanitizeSearch } from "@/lib/db/list";
import type { BookingType, BookingStatus } from "@/lib/bookings/booking-config";

export type BookingRow = Database["public"]["Tables"]["booking"]["Row"];

/**
 * Bookings whose `date` falls within the period's inclusive LOCAL calendar
 * bounds (`booking.date` is a plain `date`). Ordered by date/time. Powers
 * Finance "Booking Revenue". `scope` → cached service read (explicit business_id);
 * omitted → RLS server client (see lib/db/cache.ts).
 */
export async function listBookingsInRange(
  period: Period,
  scope?: DbScope,
): Promise<BookingRow[]> {
  const supabase = scope?.client ?? (await createClient());
  let query = supabase
    .from("booking")
    .select("*")
    .gte("date", period.startDate)
    .lte("date", period.endDate)
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false });
  if (scope) query = query.eq("business_id", scope.businessId);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/**
 * The Bookings screen's type segment + status/date/search filters, resolved to
 * database predicates (SPEC §4.2). `date` matches `booking.date` directly (it's a
 * plain local `date`, so no timezone conversion). All optional ⇒ default list.
 */
export type BookingListFilters = {
  type?: BookingType | null;
  status?: BookingStatus | null;
  /** Local `YYYY-MM-DD` — matched against booking.date verbatim. */
  date?: string | null;
  search?: string | null;
};

export type BookingsPage = {
  rows: BookingRow[];
  /** True when at least one more page exists after this one. */
  hasMore: boolean;
};

/**
 * One bounded page of the tenant's bookings — newest date first (undated last),
 * then by time. Filtering + pagination run in the DATABASE (Antigravity MED-2):
 * the type/status/date/search filters are SQL predicates and the window is
 * `.range()`d, so the transferred set is always ≤ one page instead of every
 * booking. RLS scopes it to the caller's business; no `business_id` to spoof.
 */
export async function listBookingsPage(
  filters: BookingListFilters,
  page: number,
  pageSize: number = LIST_PAGE_SIZE,
): Promise<BookingsPage> {
  const supabase = await createClient();
  const from = Math.max(0, page) * pageSize;

  let query = supabase
    .from("booking")
    .select("*")
    .order("date", { ascending: false, nullsFirst: false })
    .order("time", { ascending: true, nullsFirst: false })
    .order("id", { ascending: false });

  if (filters.type) query = query.eq("type", filters.type);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.date) query = query.eq("date", filters.date);

  const search = filters.search ? sanitizeSearch(filters.search) : "";
  if (search) {
    query = query.or(`customer_name.ilike.%${search}%,customer_phone.ilike.%${search}%`);
  }

  const { data, error } = await query.range(from, from + pageSize);
  if (error) throw error;

  const rows = data ?? [];
  const hasMore = rows.length > pageSize;
  return { rows: hasMore ? rows.slice(0, pageSize) : rows, hasMore };
}

/**
 * Exact counts of this tenant's bookings per type — the type-segment badges.
 * Head-only `count: 'exact'` per type: no rows transferred. RLS-scoped.
 */
export async function countBookingsByType(
  types: readonly BookingType[],
): Promise<Record<string, number>> {
  const supabase = await createClient();
  const results = await Promise.all(
    types.map((type) =>
      supabase.from("booking").select("id", { count: "exact", head: true }).eq("type", type),
    ),
  );
  const out: Record<string, number> = {};
  types.forEach((type, i) => {
    const { count, error } = results[i];
    if (error) throw error;
    out[type] = count ?? 0;
  });
  return out;
}

/**
 * Bookings on a single LOCAL calendar day (`booking.date` is a plain `date`, so
 * it is matched against a `YYYY-MM-DD` string, not a UTC instant). Ordered by
 * time so the caller can render the day's schedule top to bottom.
 */
export async function listBookingsOnDate(dateStr: string): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking")
    .select("*")
    .eq("date", dateStr)
    .order("time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}
