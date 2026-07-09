// Route-level loading UI (DESIGN.md §6): shown while the Bookings payload is
// fetched on navigation. Reuses the shared shape-matched skeleton.

import { BookingsSkeleton } from "@/components/bookings/bookings-skeleton";

export default function BookingsLoading() {
  return <BookingsSkeleton />;
}
