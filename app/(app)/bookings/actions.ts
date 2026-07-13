"use server";

// Bookings server actions. createBooking inserts a reservation or a custom-order
// pre-order (SPEC §4.2, CLAUDE.md §4 — BOTH types in scope).
//
// Security (CLAUDE.md §7): bookings are CRUD for all roles (RLS: "booking" is
// tenant-access for owner/manager/staff), so the action re-asserts the session
// (requireProfile) and sets business_id from the authenticated profile — never
// from the client (§7.3). Every field is Zod-validated as a discriminated union
// on `type`, so each kind accepts only its own fields; money arrives in rupees
// and is converted to integer cents here, so no float money is stored (§3). For a
// custom order the outstanding balance is COMPUTED server-side (total − deposit),
// never taken from the client. The pickup date drives when a custom order shows
// on the dashboard, so both types land with `date` set.

import { revalidatePath } from "next/cache";
import { requireProfile, getBusiness } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import { toCents, subtract } from "@/lib/money";
import { zonedWallTimeToUtcIso } from "@/lib/db/period";
import { newBookingSchema, bookingListQuerySchema } from "@/lib/zod/booking";
import {
  getBookingsPage,
  type BookingFilterInput,
  type BookingsPageResult,
} from "@/lib/db/selectors/bookings";
import type { Database } from "@/lib/supabase/types";

const DEFAULT_TIMEZONE = "Asia/Colombo";

const EMPTY_PAGE: BookingsPageResult = { items: [], hasMore: false };

/**
 * Read one page of the Bookings list for the given type segment + filters (SPEC
 * §4.2). The client browser calls this on a filter/segment change and on "Load
 * more"; all filtering + pagination happen in the database (getBookingsPage →
 * listBookingsPage), so the wire only ever carries one page. Auth is re-asserted
 * and the input Zod-validated (unknown fields rejected); RLS scopes every row to
 * the caller's tenant. Invalid input returns an empty page rather than throwing.
 */
export async function fetchBookings(input: unknown): Promise<BookingsPageResult> {
  await requireProfile();
  const parsed = bookingListQuerySchema.safeParse(input);
  if (!parsed.success) return EMPTY_PAGE;
  return getBookingsPage(parsed.data as BookingFilterInput);
}

export type CreateBookingState = { ok?: boolean; error?: string };

type BookingInsert = Database["public"]["Tables"]["booking"]["Insert"];

export async function createBooking(
  _prevState: CreateBookingState,
  formData: FormData,
): Promise<CreateBookingState> {
  const profile = await requireProfile();
  if (!profile.business_id) return { error: "bookings.new.error" };

  const type = formData.get("type");
  // Read only the fields relevant to the submitted type; the discriminated union
  // rejects the wrong shape (and unknown fields) server-side.
  const raw =
    type === "custom_order"
      ? {
          type,
          status: formData.get("status"),
          source: formData.get("source"),
          customerName: formData.get("customerName") || undefined,
          customerPhone: formData.get("customerPhone") || undefined,
          itemDescription: formData.get("itemDescription"),
          pickupDate: formData.get("pickupDate"),
          pickupTime: formData.get("pickupTime") || undefined,
          totalMajor: formData.get("total"),
          depositMajor: formData.get("deposit"),
        }
      : {
          type,
          status: formData.get("status"),
          source: formData.get("source"),
          customerName: formData.get("customerName") || undefined,
          customerPhone: formData.get("customerPhone") || undefined,
          date: formData.get("date"),
          time: formData.get("time") || undefined,
          partySize: formData.get("partySize"),
        };

  const parsed = newBookingSchema.safeParse(raw);
  if (!parsed.success) return { error: "bookings.new.invalid" };
  const data = parsed.data;

  const business = await getBusiness();
  const timezone = business?.timezone || DEFAULT_TIMEZONE;

  const base: BookingInsert = {
    business_id: profile.business_id,
    type: data.type,
    status: data.status as Database["public"]["Enums"]["booking_status"],
    source: data.source as Database["public"]["Enums"]["order_source"],
    customer_name: data.customerName ?? null,
    customer_phone: data.customerPhone ?? null,
  };

  let insert: BookingInsert;
  if (data.type === "custom_order") {
    const totalCents = toCents(data.totalMajor);
    const depositCents = toCents(data.depositMajor);
    // Balance is derived, never client-sent, and never negative.
    const balanceCents = Math.max(0, subtract(totalCents, depositCents));
    insert = {
      ...base,
      // The pickup day is the actionable date, so it drives Today's Bookings.
      date: data.pickupDate,
      time: data.pickupTime ?? null,
      item_description: data.itemDescription,
      deposit_cents: depositCents,
      balance_cents: balanceCents,
      pickup_at: zonedWallTimeToUtcIso(data.pickupDate, data.pickupTime ?? null, timezone),
    };
  } else {
    insert = {
      ...base,
      date: data.date,
      time: data.time ?? null,
      party_size: data.partySize,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("booking").insert(insert);
  if (error) return { error: "bookings.new.error" };

  // Refresh the list and the dashboard's Today's Bookings section, plus Finance's
  // booking-revenue figure via the data cache.
  revalidatePath("/bookings");
  revalidatePath("/dashboard");
  revalidateBusinessTags(profile.business_id, ["bookings"]);
  return { ok: true };
}
