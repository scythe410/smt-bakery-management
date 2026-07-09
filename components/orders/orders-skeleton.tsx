// Loading skeleton for the Orders screen (DESIGN.md §6): shape-matched blocks —
// the tab bar, the "+ New Order" action, the filter row, and a few list rows —
// never a bare spinner. No hooks; renders as a Suspense fallback / route loading
// UI. `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function OrdersSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <div className="border-border flex gap-3 border-b pb-2">
        <Bar className="h-5 w-16" />
        <Bar className="h-5 w-20" />
      </div>
      <Bar className="h-10 w-full" />
      <div className="flex gap-2">
        <Bar className="h-9 w-28" />
        <Bar className="h-9 flex-1" />
      </div>
      <Card className="flex flex-col gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Bar className="h-4 w-24" />
              <Bar className="h-4 w-16" />
            </div>
            <Bar className="h-3 w-40" />
            <div className="flex gap-1.5">
              <Bar className="rounded-pill h-4 w-14" />
              <Bar className="rounded-pill h-4 w-16" />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
