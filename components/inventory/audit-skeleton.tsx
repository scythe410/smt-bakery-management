// Loading skeleton for the ingredient-audit screen (DESIGN.md §6): a card with a
// select, an on-hand row, a count input, and a submit bar. No hooks; renders as a
// Suspense fallback. `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function AuditSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <Bar className="h-4 w-48" />
      <Card className="flex flex-col gap-3">
        <Bar className="h-10 w-full" />
        <Bar className="h-9 w-full" />
        <Bar className="h-10 w-full" />
        <Bar className="h-11 w-full" />
      </Card>
    </div>
  );
}
