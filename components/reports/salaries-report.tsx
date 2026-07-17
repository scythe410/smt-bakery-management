// Reports › Salaries (Reports §5, owner-only). Async server component — fetches the
// derived payroll report once and hands it to the presentational pieces. The stat
// cards (Total Paid / Base / Bonuses / Pending) and the per-employee table are the
// SAME salary_payment rows the Employees payroll panel approves, and the
// reconciliation line proves the paid total equals the "Salaries" expenses Finance
// shows (linked by expense_id — single source of truth, CLAUDE.md §8). Reviewed over
// a window (Day / Week / Month / Custom), unlike the single-day sales/EOD reports.

import { getSalariesReport } from "@/lib/db/selectors/salaries";
import {
  salaryPeriod,
  salaryPeriodBounds,
  type SalaryRange,
} from "@/lib/reports/report-params";
import { getBusiness, getCurrentLanguage } from "@/lib/auth";
import { getT } from "@/i18n/server";
import { formatLKR } from "@/lib/format";
import { BrandLogo } from "@/components/ui/brand-logo";
import { StatCard } from "@/components/ui/stat-card";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { SalariesDetail } from "@/components/reports/salaries-detail";

export async function SalariesReport({
  range,
  date,
  from,
  to,
}: {
  range: SalaryRange;
  date: string;
  from?: string;
  to?: string;
}) {
  const bounds = salaryPeriodBounds(range, date, from, to);
  const report = await getSalariesReport(salaryPeriod(range, date, from, to));
  const business = await getBusiness();
  const { t } = await getT(await getCurrentLanguage());

  const spanLabel =
    bounds.from === bounds.to ? bounds.from : `${bounds.from} – ${bounds.to}`;

  // PDF route params — the same window, so the document matches the screen.
  const pdfParams = new URLSearchParams({ type: "salaries", range, date });
  if (range === "custom") {
    pdfParams.set("from", bounds.from);
    pdfParams.set("to", bounds.to);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Branded header for the printed report (app chrome is print:hidden). */}
      <div className="hidden items-center gap-3 border-b border-black/10 pb-3 print:flex">
        <BrandLogo alt={business?.name ?? t("appName")} className="h-12" />
        <div className="flex flex-col">
          <span className="font-display text-h2 text-ink">{business?.name ?? t("appName")}</span>
          <span className="text-caption text-muted">
            {t("reports.type.salaries")} · {spanLabel}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard labelKey="reports.salaries.totalPaid" cents={report.totalPaidCents} tone="ink" />
        <StatCard labelKey="reports.salaries.base" cents={report.baseCents} tone="ink" />
        <StatCard labelKey="reports.salaries.bonus" cents={report.bonusCents} tone="success" />
        <StatCard labelKey="reports.salaries.pending" cents={report.pendingCents} tone="ember" />
      </div>

      {/* Finance reconciliation — proves payroll is the same money Finance shows,
          linked by expense_id, never double-counted (CLAUDE.md §8). */}
      <Card className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-caption text-muted tracking-wide uppercase">
            {t("reports.salaries.recon.title")}
          </p>
          <StatusPill
            tone={report.reconciled ? "success" : "danger"}
            label={t(
              report.reconciled ? "reports.salaries.recon.ok" : "reports.salaries.recon.mismatch",
            )}
          />
        </div>
        <ReconRow
          label={t("reports.salaries.recon.paid")}
          value={formatLKR(report.totalPaidCents)}
        />
        <ReconRow
          label={t("reports.salaries.recon.finance")}
          value={formatLKR(report.financeSalariesCents)}
        />
        <p className="text-caption text-muted mt-0.5">{t("reports.salaries.recon.note")}</p>
      </Card>

      <SalariesDetail
        rows={report.rows}
        totals={{
          daysPaid: report.daysPaid,
          baseCents: report.baseCents,
          bonusCents: report.bonusCents,
          totalPaidCents: report.totalPaidCents,
          pendingCents: report.pendingCents,
        }}
        pdfQuery={pdfParams.toString()}
        fileSuffix={bounds.from === bounds.to ? bounds.from : `${bounds.from}_${bounds.to}`}
      />
    </div>
  );
}

function ReconRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-label text-muted">{label}</span>
      <span className="text-label text-ink tabular-nums">{value}</span>
    </div>
  );
}
