// Loading skeleton for the Settings screen (DESIGN.md §6): shape-matched cards —
// each a titled section with a couple of field rows — never a bare spinner. No
// hooks; renders as a Suspense fallback and the route loading UI.

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export function SettingsSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="flex flex-col gap-3">
          <Bar className="h-4 w-40" />
          <Bar className="h-10 w-full" />
          <div className="flex gap-2">
            <Bar className="h-10 flex-1" />
            <Bar className="h-10 flex-1" />
          </div>
          <Bar className="h-10 w-28" />
        </Card>
      ))}
    </div>
  );
}
