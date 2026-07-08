// Loading skeleton for a Finance tab (DESIGN.md §6): shape-matched blocks, money
// figures as pills — never a bare spinner. Generic across tabs (stat cards + a
// wide block that stands in for the chart or the ledger). No hooks; renders as a
// Suspense fallback. `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function FinanceTabSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-7 w-28" />
          </Card>
        ))}
      </div>
      <Card>
        <Bar className="h-3 w-24" />
        <Bar className="mt-3 h-40 w-full" />
      </Card>
    </div>
  );
}
