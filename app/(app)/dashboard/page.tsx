// Dashboard — owner-only analytics screen (CLAUDE.md §5). requireRole() returns
// a 403 for manager and staff (app/forbidden.tsx). The header renders the title;
// this page lays out the sections top to bottom: Today's Sales, the Orders Today
// 2×2 grid, Est. Net Profit (with Income/Expenses breakdown), then Today's
// Bookings.
//
// Each data-driven section is its own Suspense boundary so it streams
// independently behind a shape-matched skeleton (DESIGN.md §6) — the stats and
// the bookings don't block each other.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { StockSummary } from "@/components/dashboard/stock-summary";
import { TodaysBookings } from "@/components/dashboard/todays-bookings";
import {
  StatsSkeleton,
  StockSummarySkeleton,
  BookingsSkeleton,
} from "@/components/dashboard/dashboard-skeletons";

export default async function DashboardPage() {
  await requireRole(rolesFor("dashboard"));
  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={<StatsSkeleton />}>
        <DashboardStats />
      </Suspense>
      <Suspense fallback={<StockSummarySkeleton />}>
        <StockSummary />
      </Suspense>
      <Suspense fallback={<BookingsSkeleton />}>
        <TodaysBookings />
      </Suspense>
    </div>
  );
}
