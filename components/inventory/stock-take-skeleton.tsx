// Loading skeleton for the stock-take screen (DESIGN.md §6): a status chip + a
// card of item rows with count inputs. No hooks; renders as a Suspense fallback.
// `animate-pulse` respects reduced motion via globals.css.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function StockTakeSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      <div className="flex items-center justify-between">
        <Bar className="h-6 w-20 rounded-pill" />
        <Bar className="h-4 w-32" />
      </div>
      <Card className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <Bar className="h-4 w-40" />
            <div className="flex gap-3">
              <Bar className="h-9 w-24" />
              <Bar className="h-9 w-24" />
            </div>
          </div>
        ))}
        <Bar className="h-11 w-full" />
      </Card>
    </div>
  );
}
