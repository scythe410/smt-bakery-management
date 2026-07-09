// Reports › Daily Sales (SPEC §3.5). Async server component — fetches the derived
// daily report once and hands it to the presentational pieces. The four stat
// cards (Revenue / Commission / Net Revenue / Orders) and the By Source / By
// Payment breakdowns are the REALIZED totals from selectors/_shared.ts, so they
// reconcile exactly with the same period on Dashboard and Finance. The detail
// table lists every order in the day (see ReportDetail). A note spells out that
// the headline figures count completed orders only, so the table's total column
// need not sum to Revenue.

import { getDailyReport } from "@/lib/db/selectors/reports";
import { singleDayPeriod, type ReportType } from "@/lib/reports/report-params";
import { StatCard } from "@/components/ui/stat-card";
import { ReportBreakdowns } from "@/components/reports/report-breakdowns";
import { ReportDetail } from "@/components/reports/report-detail";
import { ReportNote } from "@/components/reports/report-note";

export async function DailySalesReport({
  reportType,
  date,
}: {
  reportType: ReportType;
  date: string;
}) {
  const report = await getDailyReport(singleDayPeriod(date));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <StatCard labelKey="reports.stats.revenue" cents={report.revenueCents} tone="ink" />
        <StatCard labelKey="reports.stats.commission" cents={report.commissionCents} tone="ember" />
        <StatCard labelKey="reports.stats.netRevenue" cents={report.netRevenueCents} tone="success" />
        <StatCard labelKey="reports.stats.orders" count={report.orders} tone="ink" />
      </div>

      <ReportBreakdowns bySource={report.bySource} byPayment={report.byPayment} />

      <ReportDetail rows={report.rows} reportType={reportType} date={date} />

      <ReportNote />
    </div>
  );
}
