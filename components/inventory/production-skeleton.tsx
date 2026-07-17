// Loading skeleton for the Production screen (DESIGN.md §6): shape-matched blocks
// — an alerts card and a handful of finished-good rows with a produce control —
// never a bare spinner. `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function ProductionSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <Card className="flex flex-col gap-3">
        <Bar className="h-4 w-32" />
        <Bar className="h-3 w-48" />
      </Card>
      <Card className="flex flex-col gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-20" />
            </div>
            <Bar className="h-9 w-28" />
          </div>
        ))}
      </Card>
      {/* End-of-day leftover report */}
      <Card className="flex flex-col gap-3">
        <Bar className="h-4 w-40" />
        <Bar className="h-3 w-56" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Bar className="h-4 w-36" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="h-9 w-20" />
          </div>
        ))}
      </Card>
    </div>
  );
}
