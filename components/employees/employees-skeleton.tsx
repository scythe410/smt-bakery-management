// Loading skeleton for the Employees screen (DESIGN.md §6): shape-matched blocks
// — a header line plus a few directory cards, each with a name/role stack and a
// shift row — never a bare spinner. No hooks; renders as a Suspense fallback and
// as the route loading UI. `animate-pulse` respects reduced motion (globals.css).

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function EmployeesSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <Bar className="h-4 w-32" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Bar className="h-4 w-40" />
              <Bar className="h-3 w-24" />
            </div>
            <Bar className="rounded-pill h-5 w-16" />
          </div>
          <div className="flex gap-2">
            <Bar className="rounded-pill h-5 w-16" />
            <Bar className="rounded-pill h-5 w-20" />
            <Bar className="rounded-pill h-5 w-14" />
          </div>
        </Card>
      ))}
    </div>
  );
}
