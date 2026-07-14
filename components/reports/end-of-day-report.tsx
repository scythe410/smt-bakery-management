// Reports › End of Day (merchandise stock-take). Async server component — fetches
// the derived report once and hands it to the presentational pieces. The stat
// cards (Merchandise Revenue / Units Out / Left / Items) and the per-item detail
// table are the SAME figures the Dashboard summary and the stock-take screen show
// for the day (selectors/stock.ts), so they reconcile by construction. Revenue is
// physical `units_out × price` — the merchandise revenue basis the client asked
// for — and is distinct from order/sales revenue (Daily Sales report). When
// merchandise is billed through orders, a billing cross-check column compares
// physical out to billed out (shrinkage); it's hidden otherwise.

import { getEndOfDayReport } from "@/lib/db/selectors/stock";
import { getBusiness, getCurrentLanguage } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { BrandLogo } from "@/components/ui/brand-logo";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { EndOfDayDetail } from "@/components/reports/end-of-day-detail";

export async function EndOfDayReport({ date }: { date: string }) {
  const report = await getEndOfDayReport(date);
  const business = await getBusiness();
  const { t } = await getT(await getCurrentLanguage());

  return (
    <div className="flex flex-col gap-4">
      {/* Branded header for the printed report (app chrome is print:hidden). */}
      <div className="hidden items-center gap-3 border-b border-black/10 pb-3 print:flex">
        <BrandLogo alt={business?.name ?? t("appName")} className="h-12" />
        <div className="flex flex-col">
          <span className="font-display text-h2 text-ink">{business?.name ?? t("appName")}</span>
          <span className="text-caption text-muted">
            {t("reports.type.end_of_day")} · {date}
          </span>
        </div>
      </div>

      {report.status === "none" ? (
        <Card>
          <p className="text-body text-muted py-2">{t("stock.report.notOpened")}</p>
        </Card>
      ) : (
        <>
          <div className="flex items-center gap-2 print:hidden">
            <StatusPill
              tone={report.status === "closed" ? "success" : "warning"}
              label={t(`stock.status.${report.status}`)}
            />
            {report.status === "open" ? (
              <span className="text-caption text-muted">{t("stock.report.openNote")}</span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard labelKey="stock.stats.revenue" cents={report.totalRevenueCents} tone="success" />
            <StatCard labelKey="stock.stats.unitsOut" count={report.totalUnitsOut} tone="ink" />
            <StatCard labelKey="stock.stats.left" count={report.totalLeftQty} tone="ink" />
            <StatCard labelKey="stock.stats.items" count={report.rows.length} tone="ink" />
          </div>

          <EndOfDayDetail rows={report.rows} billed={report.billed} date={date} />

          <p className="text-caption text-muted">{t("stock.report.basis")}</p>
        </>
      )}
    </div>
  );
}
