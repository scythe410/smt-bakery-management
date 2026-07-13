// Bookings list (SPEC §4.2). Async server component — loads the FIRST page of the
// tenant's bookings (Reservations segment) and the per-type segment counts, and
// hands them to the client browser. The browser drives the type segment, search,
// filters, and "Load more" via the fetchBookings server action — every filter is a
// DB predicate and every page is bounded, so it never pulls every booking. Kept
// behind a Suspense boundary in the page so it streams in after a skeleton.

import { getBookingsPage, getBookingTypeCounts } from "@/lib/db/selectors/bookings";
import { BookingsBrowser } from "@/components/bookings/bookings-browser";

export async function BookingsList() {
  const [initial, counts] = await Promise.all([
    getBookingsPage({ type: "reservation" }),
    getBookingTypeCounts(),
  ]);
  return <BookingsBrowser initial={initial} counts={counts} />;
}
