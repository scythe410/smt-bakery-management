// Loading skeleton for the Bookings screen (DESIGN.md §6): shape-matched blocks —
// the type segment, the "+ New Booking" action, the filter row, and a few list
// rows — never a bare spinner. No hooks; renders as a Suspense fallback / route
// loading UI. `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function BookingsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <Bar className="h-10 w-full" />
      <Bar className="h-10 w-full" />
      <div className="flex gap-2">
        <Bar className="h-9 flex-1" />
        <Bar className="h-9 w-28" />
      </div>
      <Card className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Bar className="h-4 w-28" />
              <Bar className="rounded-pill h-4 w-16" />
            </div>
            <Bar className="h-3 w-44" />
            <Bar className="h-3 w-24" />
          </div>
        ))}
      </Card>
    </div>
  );
}
