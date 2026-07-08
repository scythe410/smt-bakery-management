// selectors/bookings.ts — the Dashboard's "Today's Bookings" section (SPEC §3.1).
//
// "Today" is the tenant's local day (see lib/db/period.ts), so a booking dated
// today for the shop shows here regardless of the server's clock. Returns a
// typed view model per booking with money kept in integer cents; the row
// component formats and translates at render.

import "server-only";
import { cache } from "react";
import { listBookingsOnDate } from "@/lib/db/queries/bookings";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { Database } from "@/lib/supabase/types";

type BookingType = Database["public"]["Enums"]["booking_type"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type TodaysBooking = {
  id: string;
  type: BookingType;
  status: BookingStatus;
  /** `HH:MM` local time, or null if unscheduled. */
  time: string | null;
  /** Customer name as entered (dynamic content — not translated). */
  customerName: string | null;
  /** Reservations: party size. */
  partySize: number | null;
  /** Custom orders: what's being made (dynamic content — not translated). */
  itemDescription: string | null;
  /** Custom orders: outstanding balance still owed, integer cents. */
  balanceCents: number | null;
};

/**
 * Today's bookings for the current tenant, ordered by time. React-`cache()`d so
 * the section and any sibling reading it share one query per request.
 */
export const getTodaysBookings = cache(async (): Promise<TodaysBooking[]> => {
  const period = await resolveTenantPeriod({ kind: "today" });
  const rows = await listBookingsOnDate(period.startDate);

  return rows.map((b) => ({
    id: b.id,
    type: b.type,
    status: b.status,
    time: b.time,
    customerName: b.customer_name,
    partySize: b.party_size,
    itemDescription: b.item_description,
    balanceCents: b.balance_cents,
  }));
});
