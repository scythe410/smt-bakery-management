// Finance › Overview (SPEC §3.2): the period stat cards + Revenue-by-Day chart.
// Server component — fetches the derived overview once; the cards/chart only
// format and translate. Total Income and Net Profit read green, Total Expenses
// ember (DESIGN.md §2); Net Profit is labelled "Est." because it embeds
// estimated COGS (CLAUDE.md §3). Total Orders spans the full width as the 5th,
// odd card.

import { getFinanceOverview } from "@/lib/db/selectors/finance";
import { StatCard } from "@/components/ui/stat-card";
import { RevenueBarChart } from "@/components/finance/revenue-bar-chart";
import type { PeriodInput } from "@/lib/db/period";

export async function OverviewTab({ period }: { period: PeriodInput }) {
  const overview = await getFinanceOverview(period);
  const profitTone = overview.netProfitCents >= 0 ? "success" : "danger";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          labelKey="finance.overview.totalIncome"
          cents={overview.totalIncomeCents}
          tone="success"
        />
        <StatCard
          labelKey="finance.overview.bookingRevenue"
          cents={overview.bookingRevenueCents}
          tone="ink"
        />
        <StatCard
          labelKey="finance.overview.totalExpenses"
          cents={overview.totalExpensesCents}
          tone="ember"
        />
        <StatCard
          labelKey="finance.overview.netProfit"
          cents={overview.netProfitCents}
          tone={profitTone}
          estimated
        />
        <StatCard
          className="col-span-2"
          labelKey="finance.overview.totalOrders"
          count={overview.totalOrders}
          tone="ink"
        />
      </div>
      <RevenueBarChart data={overview.revenueByDay} />
    </div>
  );
}
