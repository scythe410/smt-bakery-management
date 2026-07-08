// queries/bookings.ts — raw, tenant-scoped booking reads. RLS-scoped; no
// derivation here (see lib/db/selectors). CLAUDE.md §7.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type BookingRow = Database["public"]["Tables"]["booking"]["Row"];

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
