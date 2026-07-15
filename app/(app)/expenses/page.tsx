// Expenses (SPEC §3.2, staff-facing slice) — the standalone Expenses ledger for
// the staff role. CF5 hides income / revenue / profit from staff, NOT costs, so
// staff may record and view expenses here without ever seeing the Finance
// overview, Reports, or any aggregate sales figure. requireRole() returns a real
// 403 for owner/manager (app/forbidden.tsx) — they reach expenses inside Finance,
// so this route is staff-only and stays off their nav.
//
// It reuses Finance's ExpensesTab (the same ledger + add-expense form and the
// same server action), scoped to This Month. The RLS staff policies (migration
// 20260715170000) are the real boundary; this gate is defense-in-depth.

import { Suspense } from "react";
import { requireRole, rolesFor } from "@/lib/auth";
import { ExpensesTab } from "@/components/finance/expenses-tab";
import { FinanceTabSkeleton } from "@/components/finance/finance-skeleton";

export default async function ExpensesPage() {
  await requireRole(rolesFor("expenses"));

  return (
    <Suspense fallback={<FinanceTabSkeleton />}>
      <ExpensesTab period={{ kind: "month" }} />
    </Suspense>
  );
}
