// queries/bookings.ts — raw, tenant-scoped booking reads. RLS-scoped; no
// derivation here (see lib/db/selectors). CLAUDE.md §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { Period } from "@/lib/db/period";

export type BookingRow = Database["public"]["Tables"]["booking"]["Row"];

/**
 * Bookings whose `date` falls within the period's inclusive LOCAL calendar
 * bounds (`booking.date` is a plain `date`). Ordered by date/time. Powers
 * Finance "Booking Revenue".
 */
export async function listBookingsInRange(period: Period): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking")
    .select("*")
    .gte("date", period.startDate)
    .lte("date", period.endDate)
    .order("date", { ascending: true })
    .order("time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
}

/**
 * Every booking for the current tenant, newest date first (undated last), then
 * by time. Powers the Bookings screen list (SPEC §4.2). RLS scopes it to the
 * caller's business; no `business_id` filter to spoof.
 */
export async function listAllBookings(): Promise<BookingRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("booking")
    .select("*")
    .order("date", { ascending: false, nullsFirst: false })
    .order("time", { ascending: true, nullsFirst: false });

  if (error) throw error;
  return data ?? [];
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
