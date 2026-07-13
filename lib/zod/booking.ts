// Zod schema for the new-booking mutation. Validated server-side (CLAUDE.md
// §7.6); a discriminated union on `type` so reservations and custom orders each
// validate only their own fields. business_id / customer_id are NEVER taken from
// the client — the action sets them from the authenticated profile. Money
// arrives in major units (rupees) and is converted to integer cents in the
// action (lib/money.toCents) — no float money is ever stored (CLAUDE.md §3).

import { z } from "zod";
import { BOOKING_STATUSES, BOOKING_SOURCES, BOOKING_TYPES } from "@/lib/bookings/booking-config";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD
const TIME_RE = /^\d{2}:\d{2}$/; // HH:mm

const shared = {
  status: z.enum(BOOKING_STATUSES as unknown as [string, ...string[]]),
  source: z.enum(BOOKING_SOURCES as unknown as [string, ...string[]]),
  customerName: z.string().trim().max(120).optional(),
  customerPhone: z.string().trim().max(40).optional(),
};

// Each union member is `.strict()` so unknown fields are rejected — including a
// reservation field smuggled into a custom order or vice-versa (CLAUDE.md §7.6).
const reservationSchema = z
  .object({
    type: z.literal("reservation"),
    ...shared,
    // Reservations are always dated (they feed Today's Bookings); time optional.
    date: z.string().regex(DATE_RE),
    time: z.string().regex(TIME_RE).optional(),
    partySize: z.coerce.number().int().min(1).max(1000),
  })
  .strict();

const customOrderSchema = z
  .object({
    type: z.literal("custom_order"),
    ...shared,
    itemDescription: z.string().trim().min(1).max(500),
    // The pickup day drives when the order appears on the dashboard.
    pickupDate: z.string().regex(DATE_RE),
    pickupTime: z.string().regex(TIME_RE).optional(),
    // Major-unit amounts (rupees) → cents in the action. Balance = total − deposit.
    totalMajor: z.coerce.number().min(0).finite().max(1_000_000_000),
    depositMajor: z.coerce.number().min(0).finite().max(1_000_000_000),
  })
  .strict();

export const newBookingSchema = z.discriminatedUnion("type", [
  reservationSchema,
  customOrderSchema,
]);

export type NewBookingInput = z.infer<typeof newBookingSchema>;

// Zod schema for the Bookings list READ query (the fetchBookings action). A read,
// but the input crosses the client→server boundary, so it's validated and unknown
// fields rejected — the segment/filters/page become DB predicates server-side.
// Every filter is optional; `nullable` because the client sends `null` for a
// cleared filter.
export const bookingListQuerySchema = z
  .object({
    type: z.enum(BOOKING_TYPES as unknown as [string, ...string[]]),
    status: z.enum(BOOKING_STATUSES as unknown as [string, ...string[]]).nullish(),
    date: z.string().regex(DATE_RE).nullish(),
    search: z.string().trim().max(100).nullish(),
    page: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

export type BookingListQuery = z.infer<typeof bookingListQuerySchema>;
