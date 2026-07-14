// Loading skeletons for the Dashboard (DESIGN.md §6): blocks that match the
// real card/list shapes, money figures as a pill of the right width — never a
// bare spinner. No hooks, no i18n (nothing to read yet); render on the server as
// Suspense fallbacks. `animate-pulse` respects prefers-reduced-motion via the
// global reduced-motion rule in globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

/** Skeleton for the three stat cards (Sales, Orders grid, Net Profit). */
export function StatsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      {/* Today's Sales */}
      <Card>
        <Bar className="h-3 w-24" />
        <Bar className="mt-2 h-9 w-48" />
      </Card>

      {/* Orders Today 2×2 */}
      <Card>
        <Bar className="h-3 w-28" />
        <div className="mt-3 grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Bar className="size-9 shrink-0 rounded-[10px]" />
              <div className="flex-1">
                <Bar className="h-5 w-10" />
                <Bar className="mt-1 h-3 w-14" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Est. Net Profit */}
      <Card>
        <Bar className="h-3 w-32" />
        <Bar className="mt-2 h-9 w-44" />
        <div className="border-border mt-3 flex flex-col gap-2 border-t pt-3">
          <div className="flex justify-between">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-20" />
          </div>
          <div className="flex justify-between">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-20" />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Skeleton for the stock-take summary card (label + figure + two stat lines). */
export function StockSummarySkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Bar className="h-3 w-28" />
          <Bar className="rounded-pill h-5 w-16" />
        </div>
        <div className="flex items-end justify-between">
          <Bar className="h-7 w-32" />
          <div className="flex flex-col items-end gap-1">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-16" />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Skeleton for the Today's Bookings section (title + a few list rows). */
export function BookingsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2" aria-hidden>
      <Bar className="ml-1 h-4 w-32" />
      <Card>
        <ul className="flex flex-col">
          {Array.from({ length: 3 }).map((_, i) => (
            <li
              key={i}
              className="border-border flex items-start justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
            >
              <div className="flex-1">
                <Bar className="h-4 w-40" />
                <Bar className="mt-1.5 h-3 w-28" />
              </div>
              <Bar className="rounded-pill h-5 w-16" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
