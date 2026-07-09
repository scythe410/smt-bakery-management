// Bookings (SPEC §4.2) — accessible to all roles (RLS: "booking" is tenant-access
// for owner/manager/staff, CLAUDE.md §5). The screen title lives in the shell
// header. The list is fetched behind a Suspense boundary so it streams in after a
// shape-matched skeleton (DESIGN.md §6).

import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { BookingsList } from "@/components/bookings/bookings-list";
import { BookingsSkeleton } from "@/components/bookings/bookings-skeleton";

export default async function BookingsPage() {
  await requireProfile();
  return (
    <Suspense fallback={<BookingsSkeleton />}>
      <BookingsList />
    </Suspense>
  );
}
