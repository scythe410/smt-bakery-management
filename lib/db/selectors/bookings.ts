// selectors/bookings.ts — the Dashboard's "Today's Bookings" section (SPEC §3.1).
//
// "Today" is the tenant's local day (see lib/db/period.ts), so a booking dated
// today for the shop shows here regardless of the server's clock. Returns a
// typed view model per booking with money kept in integer cents; the row
// component formats and translates at render.

import "server-only";
import { cache } from "react";
import {
  listBookingsOnDate,
  listBookingsPage,
  countBookingsByType,
  type BookingRow,
} from "@/lib/db/queries/bookings";
import { resolveTenantPeriod } from "@/lib/db/selectors/context";
import { BOOKING_TYPES } from "@/lib/bookings/booking-config";
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

function toBookingListItem(b: BookingRow): BookingListItem {
  return {
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
  };
}

/** What the Bookings screen asks for: the active type segment + filters + page. */
export type BookingFilterInput = {
  type: BookingType;
  status?: BookingStatus | null;
  /** Local `YYYY-MM-DD` day filter (matched against booking.date verbatim). */
  date?: string | null;
  search?: string | null;
  /** Zero-based page index. */
  page?: number;
};

export type BookingsPageResult = {
  items: BookingListItem[];
  /** True when another page exists after this one. */
  hasMore: boolean;
};

/**
 * One page of the Bookings list for a given filter set — filtered and paginated
 * in the database (see listBookingsPage). NOT React-cached: it's a dynamic,
 * per-interaction read (the server component seeds page 0; the fetchBookings
 * action serves later pages and filter changes). Money stays integer cents; the
 * row component formats and translates at render.
 */
export async function getBookingsPage(input: BookingFilterInput): Promise<BookingsPageResult> {
  const { rows, hasMore } = await listBookingsPage(
    {
      type: input.type,
      status: input.status ?? null,
      date: input.date ?? null,
      search: input.search ?? null,
    },
    input.page ?? 0,
  );
  return { items: rows.map(toBookingListItem), hasMore };
}

export type BookingTypeCounts = { reservation: number; custom_order: number };

/** Per-type segment badge counts for this tenant. React-`cache()`d per request. */
export const getBookingTypeCounts = cache(async (): Promise<BookingTypeCounts> => {
  const counts = await countBookingsByType(BOOKING_TYPES);
  return { reservation: counts.reservation ?? 0, custom_order: counts.custom_order ?? 0 };
});
