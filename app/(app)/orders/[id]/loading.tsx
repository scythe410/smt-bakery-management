// Loading skeleton for the order detail page (DESIGN.md §6).

import { Card } from "@/components/ui/card";

function Bar({ className = "" }: { className?: string }) {
  return <span className={`bg-border block rounded ${className}`} />;
}

export default function OrderDetailLoading() {
  return (
    <div className="flex animate-pulse flex-col gap-3" aria-hidden>
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Bar className="h-10 w-28" />
        <div className="flex-1" />
        <Bar className="h-10 w-32" />
      </div>
      {/* Header card */}
      <Card className="flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-2">
            <Bar className="h-3 w-16" />
            <Bar className="h-6 w-24" />
          </div>
          <Bar className="rounded-pill h-5 w-20" />
        </div>
        <div className="border-border border-t pt-3 flex flex-col gap-2">
          <div className="flex justify-between">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-32" />
          </div>
          <div className="flex justify-between">
            <Bar className="h-3 w-12" />
            <Bar className="h-3 w-20" />
          </div>
          <div className="flex justify-between">
            <Bar className="h-3 w-20" />
            <Bar className="h-3 w-24" />
          </div>
        </div>
      </Card>
      {/* Items card */}
      <Card className="flex flex-col gap-3">
        <Bar className="h-4 w-12" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex justify-between gap-3 py-1">
            <div className="flex flex-col gap-1.5">
              <Bar className="h-3.5 w-28" />
              <Bar className="h-2.5 w-20" />
            </div>
            <Bar className="h-3.5 w-16" />
          </div>
        ))}
      </Card>
      {/* Totals card */}
      <Card className="flex flex-col gap-3">
        <Bar className="h-4 w-12" />
        <div className="flex flex-col gap-2">
          <div className="flex justify-between">
            <Bar className="h-3 w-16" />
            <Bar className="h-3 w-20" />
          </div>
          <div className="border-border border-t pt-2 flex justify-between">
            <Bar className="h-3.5 w-12" />
            <Bar className="h-3.5 w-24" />
          </div>
        </div>
        <div className="border-border border-t pt-2 flex gap-2">
          <Bar className="rounded-pill h-5 w-14" />
          <Bar className="rounded-pill h-5 w-16" />
        </div>
      </Card>
    </div>
  );
}
