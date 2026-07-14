// Loading skeleton for the Employees screen (DESIGN.md §6): a payroll-bar block
// (visible to owner, but safe to render for all since it just pulses), then
// shape-matched directory cards. Never a bare spinner. `animate-pulse` respects
// reduced motion (globals.css).

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function EmployeesSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      {/* Payroll bar skeleton */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <Bar className="h-4 w-24" />
          <Bar className="h-4 w-28" />
        </div>
        <Bar className="h-2.5 w-full rounded-pill" />
        <div className="flex items-center justify-between">
          <Bar className="h-3 w-20" />
          <Bar className="h-3 w-16" />
        </div>
      </Card>

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
          <div className="border-border flex items-center justify-between border-t pt-3">
            <div className="flex flex-col gap-1">
              <Bar className="h-3 w-10" />
              <Bar className="h-4 w-28" />
            </div>
            <div className="flex items-center gap-2">
              <Bar className="rounded-pill h-5 w-14" />
              <Bar className="h-3 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
