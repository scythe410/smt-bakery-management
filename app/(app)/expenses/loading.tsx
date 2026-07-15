// Route-level loading UI (DESIGN.md §6): shown while the standalone Expenses
// ledger is fetched on navigation. Reuses the shared Finance tab skeleton.

import { FinanceTabSkeleton } from "@/components/finance/finance-skeleton";

export default function ExpensesLoading() {
  return <FinanceTabSkeleton />;
}
