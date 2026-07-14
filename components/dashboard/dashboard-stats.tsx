// DashboardStats — server component that loads the derived summary once and
// hands each figure to a card. All money is pre-computed in getDashboardSummary
// (CLAUDE.md §2/§3); the cards only format and translate. Suspended by the page
// behind a skeleton while this awaits. requireRole() re-asserts the owner gate
// at render time (defence in depth beside the page gate; cached, so free).

import { requireRole, rolesFor } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/db/selectors/dashboard";
import { TodaysSalesCard } from "@/components/dashboard/todays-sales-card";
import { OrdersTodayGrid } from "@/components/dashboard/orders-today-grid";
import { NetProfitCard } from "@/components/dashboard/net-profit-card";

export async function DashboardStats() {
  await requireRole(rolesFor("dashboard"));
  const summary = await getDashboardSummary();

  return (
    <div className="animate-rise flex flex-col gap-3">
      <TodaysSalesCard salesCents={summary.salesCents} />
      <OrdersTodayGrid orders={summary.orders} />
      <NetProfitCard
        estNetProfitCents={summary.estNetProfitCents}
        incomeCents={summary.profit.incomeCents}
        expensesCents={summary.profit.expensesCents}
      />
    </div>
  );
}
