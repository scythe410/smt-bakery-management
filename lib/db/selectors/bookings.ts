// selectors/bookings.ts — the Dashboard's "Today's Bookings" section (SPEC §3.1).
//
// "Today" is the tenant's local day (see lib/db/period.ts), so a booking dated
// today for the shop shows here regardless of the server's clock. Returns a
// typed view model per booking with money kept in integer cents; the row
// component formats and translates at render.

import "server-only";
import { cache } from "react";
import { listBookingsOnDate, listAllBookings } from "@/lib/db/queries/bookings";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import type { Database } from "@/lib/supabase/types";

type BookingType = Database["public"]["Enums"]["booking_type"];
type BookingStatus = Database["public"]["Enums"]["booking_status"];
type BookingSource = Database["public"]["Enums"]["order_source"];

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
    time: hhmm(b.time),
    customerName: b.customer_name,
    partySize: b.party_size,
    itemDescription: b.item_description,
    balanceCents: b.balance_cents,
  }));
});

/** Trim a Postgres `time` (`HH:MM:SS`) to a display `HH:MM`; null passes through. */
function hhmm(time: string | null): string | null {
  return time ? time.slice(0, 5) : null;
}

export type BookingListItem = {
  id: string;
  type: BookingType;
  status: BookingStatus;
  source: BookingSource | null;
  /** Local calendar date `YYYY-MM-DD` (reservation date / custom-order pickup). */
  date: string | null;
  /** `HH:MM` local time, or null if unscheduled. */
  time: string | null;
  /** Customer name/phone as entered (dynamic content — not translated). */
  customerName: string | null;
  customerPhone: string | null;
  /** Reservations: party size. */
  partySize: number | null;
  /** Custom orders: what's being made (dynamic content — not translated). */
  itemDescription: string | null;
  /** Custom orders: deposit taken + outstanding balance, integer cents. */
  depositCents: number | null;
  balanceCents: number | null;
};

/**
 * All bookings for the current tenant (both types), newest first — the Bookings
 * screen list (SPEC §4.2). The screen segments by `type` client-side. Money stays
 * integer cents; the row component formats and translates at render.
 * React-`cache()`d per request.
 */
export const getBookingsList = cache(async (): Promise<BookingListItem[]> => {
  const rows = await listAllBookings();
  return rows.map((b) => ({
    id: b.id,
    type: b.type,
    status: b.status,
    source: b.source,
    date: b.date,
    time: hhmm(b.time),
    customerName: b.customer_name,
    customerPhone: b.customer_phone,
    partySize: b.party_size,
    itemDescription: b.item_description,
    depositCents: b.deposit_cents,
    balanceCents: b.balance_cents,
  }));
});
