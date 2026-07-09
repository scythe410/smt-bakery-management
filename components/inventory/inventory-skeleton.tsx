// Loading skeleton for the Inventory screen (DESIGN.md §6): shape-matched blocks
// — the toolbar (pill + add), the filter row, and a handful of list rows — never
// a bare spinner. No hooks; renders as a Suspense fallback / route loading UI.
// `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function InventorySkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <div className="flex items-center justify-between gap-2">
        <Bar className="h-8 w-28 rounded-pill" />
        <Bar className="h-9 w-24" />
      </div>
      <div className="flex gap-2">
        <Bar className="h-9 w-32" />
        <Bar className="h-9 flex-1" />
      </div>
      <Card className="flex flex-col gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="h-4 w-16" />
          </div>
        ))}
      </Card>
    </div>
  );
}
