// TodaysBookings — server component that loads the tenant's bookings for today
// and hands them to the client list (which renders the title, rows, and empty
// state). Suspended by the page behind a skeleton while this awaits.

import { getTodaysBookings } from "@/lib/db/selectors/bookings";
import { BookingsList } from "@/components/dashboard/bookings-list";

export async function TodaysBookings() {
  const bookings = await getTodaysBookings();
  return <BookingsList bookings={bookings} />;
}
