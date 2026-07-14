// StockSummary — server component that loads today's stock-take summary and gates
// the revenue figure by role (owner/manager). Suspended by the page behind a
// skeleton while it awaits. requireProfile() re-asserts the session (cached, free).

import { requireProfile, canAccess } from "@/lib/auth";
import { getStockDaySummary } from "@/lib/db/selectors/stock";
import { StockSummaryCard } from "@/components/dashboard/stock-summary-card";

export async function StockSummary() {
  const profile = await requireProfile();
  const summary = await getStockDaySummary();
  const canSeeRevenue = canAccess(profile.role, "reports");
  return (
    <div className="animate-rise">
      <StockSummaryCard summary={summary} canSeeRevenue={canSeeRevenue} />
    </div>
  );
}
