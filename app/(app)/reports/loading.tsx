// Route-level loading UI (DESIGN.md §6): shown while the Reports payload is
// fetched on navigation. A controls placeholder + the report skeleton.

import { ReportsSkeleton } from "@/components/reports/reports-skeleton";

export default function ReportsLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex animate-pulse flex-col gap-2" aria-hidden>
        <span className="bg-border block h-9 w-full rounded" />
        <span className="bg-border block h-9 w-full rounded" />
      </div>
      <ReportsSkeleton />
    </div>
  );
}
