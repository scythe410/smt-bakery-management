// Dashboard — the landing screen for every role (SPEC §3.1). The header renders
// the title; this page lays out the sections top to bottom: Today's Sales, the
// Orders Today 2×2 grid, Est. Net Profit (with Income/Expenses breakdown), then
// Today's Bookings.
//
// Each data-driven section is its own Suspense boundary so it streams
// independently behind a shape-matched skeleton (DESIGN.md §6) — the stats and
// the bookings don't block each other. The session is gated in the (app) layout
// (redirects unauthenticated users) and re-asserted inside DashboardStats.

import { Suspense } from "react";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { StockSummary } from "@/components/dashboard/stock-summary";
import { TodaysBookings } from "@/components/dashboard/todays-bookings";
import {
  StatsSkeleton,
  StockSummarySkeleton,
  BookingsSkeleton,
} from "@/components/dashboard/dashboard-skeletons";

export default function DashboardPage() {
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
