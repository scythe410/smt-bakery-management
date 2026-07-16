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
import { getBusiness, getCurrentLanguage } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { formatLKR } from "@/lib/format";
import { BrandLogo } from "@/components/ui/brand-logo";
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
  const business = await getBusiness();
  const { t } = await getT(await getCurrentLanguage());

  return (
    <div className="flex flex-col gap-4">
      {/* Branded header for the printed bill/report — only shown when printing
          (the app chrome is print:hidden), so the PDF/print reads as a document. */}
      <div className="hidden items-center gap-3 border-b border-black/10 pb-3 print:flex">
        <BrandLogo alt={business?.name ?? t("appName")} className="h-12" />
        <div className="flex flex-col">
          <span className="font-display text-h2 text-ink">{business?.name ?? t("appName")}</span>
          <span className="text-caption text-muted">
            {t(`reports.type.${reportType}`)} · {date}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard labelKey="reports.stats.revenue" cents={report.revenueCents} tone="ink" />
        <StatCard labelKey="reports.stats.commission" cents={report.commissionCents} tone="ember" />
        <StatCard labelKey="reports.stats.netRevenue" cents={report.netRevenueCents} tone="success" />
        <StatCard labelKey="reports.stats.orders" count={report.orders} tone="ink" />
      </div>

      {/* Discount reconciliation — only when discounts were given in the window.
          Gross sales − discounts = revenue keeps the honest figures reconciling
          (revenue is the net amount actually collected). */}
      {report.discountCents > 0 ? (
        <div className="border-border bg-surface shadow-card flex flex-col gap-1.5 rounded-[var(--radius)] border p-4">
          <p className="text-caption text-muted tracking-wide uppercase">
            {t("reports.discounts.title")}
          </p>
          <ReconRow
            label={t("reports.discounts.grossSales")}
            value={formatLKR(report.grossSalesCents)}
          />
          <ReconRow
            label={t("reports.discounts.discount")}
            value={`- ${formatLKR(report.discountCents)}`}
            ember
          />
          <div className="border-border-strong mt-0.5 border-t pt-1.5">
            <ReconRow
              label={t("reports.discounts.revenue")}
              value={formatLKR(report.revenueCents)}
              bold
            />
          </div>
        </div>
      ) : null}

      <ReportBreakdowns bySource={report.bySource} byPayment={report.byPayment} />

      <ReportDetail rows={report.rows} reportType={reportType} date={date} />

      <ReportNote />
    </div>
  );
}

function ReconRow({
  label,
  value,
  bold = false,
  ember = false,
}: {
  label: string;
  value: string;
  bold?: boolean;
  ember?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-label ${bold ? "text-ink font-bold" : "text-muted"}`}>{label}</span>
      <span
        className={`text-label tabular-nums ${
          bold ? "text-ink font-bold" : ember ? "text-brand-ember" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
