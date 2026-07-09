// Loading skeleton for the Daily Sales report (DESIGN.md §6): shape-matched
// blocks — four stat cards, two breakdown cards, a table block — money figures as
// pills, never a bare spinner. No hooks; renders as a Suspense fallback.
// `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function ReportsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <Bar className="h-3 w-20" />
            <Bar className="mt-2 h-7 w-28" />
          </Card>
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-3">
          <Bar className="h-3 w-24" />
          <Bar className="h-4 w-full" />
          <Bar className="h-4 w-full" />
        </Card>
      ))}
      <Card className="flex flex-col gap-3">
        <Bar className="h-4 w-24" />
        <Bar className="h-32 w-full" />
      </Card>
    </div>
  );
}
