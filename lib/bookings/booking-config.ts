// Booking enums as client-safe config (SPEC §4.2 / CLAUDE.md §4). Kept here (no
// `server-only`) so the type segment, the new-booking form, and the Zod schema
// share ONE ordered source of truth. Values are enum keys; display labels come
// from i18n (`bookings.type.*`, `bookings.status.*`, `source.*`), so nothing
// user-facing is hardcoded (CLAUDE.md §3). Bookings share the order `source`
// enum, so the source list is reused from order-config rather than duplicated.

import type { Database } from "@/lib/supabase/types";
import { ORDER_SOURCES } from "@/lib/orders/order-config";

export type BookingType = Database["public"]["Enums"]["booking_type"];
export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type BookingSource = Database["public"]["Enums"]["order_source"];

// The two booking kinds — CLAUDE.md §4 confirms BOTH are in scope. This order
// drives the on-screen type segment.
export const BOOKING_TYPES: readonly BookingType[] = ["reservation", "custom_order"] as const;

export const BOOKING_STATUSES: readonly BookingStatus[] = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
] as const;

// Bookings and orders draw sources from the same Postgres enum.
export const BOOKING_SOURCES: readonly BookingSource[] = ORDER_SOURCES;
