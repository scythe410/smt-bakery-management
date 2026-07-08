// Route-level loading UI (DESIGN.md §6): shown while the dashboard's server
// payload is fetched on navigation. Mirrors the page's own Suspense fallbacks so
// the skeleton shape is identical whether a section streams or the whole route
// is still loading.

import { StatsSkeleton, BookingsSkeleton } from "@/components/dashboard/dashboard-skeletons";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-4">
      <StatsSkeleton />
      <BookingsSkeleton />
    </div>
  );
}
