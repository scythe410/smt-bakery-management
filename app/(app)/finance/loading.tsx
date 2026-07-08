// Route-level loading UI (DESIGN.md §6): shown while the Finance payload is
// fetched on navigation. A tab-bar placeholder + the shared tab skeleton.

import { FinanceTabSkeleton } from "@/components/finance/finance-skeleton";

export default function FinanceLoading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="border-border flex animate-pulse gap-3 border-b pb-2" aria-hidden>
        <span className="bg-border block h-5 w-20 rounded" />
        <span className="bg-border block h-5 w-20 rounded" />
        <span className="bg-border block h-5 w-28 rounded" />
      </div>
      <FinanceTabSkeleton />
    </div>
  );
}
