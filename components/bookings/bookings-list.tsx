// Bookings list (SPEC §4.2). Async server component — loads the tenant's derived
// booking list and hands it to the client browser, which does the type segment,
// search, filters, the create flow, and rendering. Kept behind a Suspense
// boundary in the page so it streams in after a skeleton.

import { getBookingsList } from "@/lib/db/selectors/bookings";
import { BookingsBrowser } from "@/components/bookings/bookings-browser";

export async function BookingsList() {
  const bookings = await getBookingsList();
  return <BookingsBrowser bookings={bookings} />;
}
