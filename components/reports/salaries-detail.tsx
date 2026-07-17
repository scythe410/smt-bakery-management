"use client";

// Salaries report detail table + exports (Reports §5). Per-employee payroll over
// the window: days paid, base, bonuses, total paid, and pending. Mirrors
// ReportDetail — the row set is what the CSV/PDF output is, so it renders as it
// exports (the one place DESIGN.md §4 sanctions a wide table on mobile). Export CSV
// builds the file client-side from the already-derived rows (toMajor is render-time
// formatting, no money math — CLAUDE.md §3); PDF hands off to the server route with
// the same period params so the document matches the screen.

import { Download, FileDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { csvRow } from "@/lib/csv";
import { formatLKR } from "@/lib/format";
import { toMajor } from "@/lib/money";
import type { SalaryEmployeeRow } from "@/lib/db/selectors/salaries";

export function SalariesDetail({
  rows,
  totals,
  pdfQuery,
  fileSuffix,
}: {
  rows: SalaryEmployeeRow[];
  totals: {
    daysPaid: number;
    baseCents: number;
    bonusCents: number;
    totalPaidCents: number;
    pendingCents: number;
  };
  /** Query string (already encoded) for the PDF route — the same period params. */
  pdfQuery: string;
  /** Date span for the download filename (e.g. `2026-07-01_2026-07-31`). */
  fileSuffix: string;
}) {
  const { t } = useTranslation();
  const dash = t("reports.detail.none");

  function exportCsv() {
    const headers = [
      t("reports.salaries.employee"),
      t("reports.salaries.daysPaid"),
      t("reports.salaries.base"),
      t("reports.salaries.bonus"),
      t("reports.salaries.totalPaid"),
      t("reports.salaries.pending"),
    ];
    const body = rows.map((r) =>
      csvRow([
        r.name || dash,
        r.daysPaid,
        toMajor(r.baseCents).toFixed(2),
        toMajor(r.bonusCents).toFixed(2),
        toMajor(r.totalPaidCents).toFixed(2),
        toMajor(r.pendingCents).toFixed(2),
      ]),
    );
    const totalRow = csvRow([
      t("reports.salaries.total"),
      totals.daysPaid,
      toMajor(totals.baseCents).toFixed(2),
      toMajor(totals.bonusCents).toFixed(2),
      toMajor(totals.totalPaidCents).toFixed(2),
      toMajor(totals.pendingCents).toFixed(2),
    ]);
    const csv = [csvRow(headers), ...body, totalRow].join("\r\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `salaries-${fileSuffix}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "text-caption text-muted px-2 py-2 text-left font-medium tracking-wide uppercase";
  const td = "text-label text-ink px-2 py-2 align-top";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-h2 text-ink">{t("reports.salaries.detailTitle")}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            disabled={rows.length === 0}
            className="border-border-strong text-label text-ink hover:bg-surface-2 focus-visible:ring-brand/40 flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium outline-none transition-colors focus-visible:ring-2 disabled:opacity-50"
          >
            <Download className="size-4" aria-hidden />
            {t("reports.actions.exportCsv")}
          </button>
          <a
            href={`/api/reports/pdf?${pdfQuery}`}
            download
            className="border-border-strong text-label text-ink hover:bg-surface-2 focus-visible:ring-brand/40 flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium outline-none transition-colors focus-visible:ring-2"
          >
            <FileDown className="size-4" aria-hidden />
            {t("reports.actions.downloadPdf")}
          </a>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-body text-muted py-2">{t("reports.salaries.empty")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-border border-b">
                <th className={th}>{t("reports.salaries.employee")}</th>
                <th className={`${th} text-right`}>{t("reports.salaries.daysPaid")}</th>
                <th className={`${th} text-right`}>{t("reports.salaries.base")}</th>
                <th className={`${th} text-right`}>{t("reports.salaries.bonus")}</th>
                <th className={`${th} text-right`}>{t("reports.salaries.totalPaid")}</th>
                <th className={`${th} text-right`}>{t("reports.salaries.pending")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employeeId} className="border-border border-b last:border-0">
                  <td className={`${td} max-w-40 truncate`}>{r.name || dash}</td>
                  <td className={`${td} text-right`}>{r.daysPaid}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatLKR(r.baseCents)}</td>
                  <td className={`${td} text-right whitespace-nowrap`}>{formatLKR(r.bonusCents)}</td>
                  <td className={`${td} text-right whitespace-nowrap font-semibold`}>
                    {formatLKR(r.totalPaidCents)}
                  </td>
                  <td
                    className={`${td} text-right whitespace-nowrap ${
                      r.pendingCents > 0 ? "text-warning" : "text-muted"
                    }`}
                  >
                    {r.pendingCents > 0 ? formatLKR(r.pendingCents) : dash}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-border border-t-2">
                <td className={`${td} font-bold`}>{t("reports.salaries.total")}</td>
                <td className={`${td} text-right font-bold`}>{totals.daysPaid}</td>
                <td className={`${td} text-right font-bold whitespace-nowrap`}>
                  {formatLKR(totals.baseCents)}
                </td>
                <td className={`${td} text-right font-bold whitespace-nowrap`}>
                  {formatLKR(totals.bonusCents)}
                </td>
                <td className={`${td} text-right font-bold whitespace-nowrap`}>
                  {formatLKR(totals.totalPaidCents)}
                </td>
                <td className={`${td} text-right font-bold whitespace-nowrap`}>
                  {totals.pendingCents > 0 ? formatLKR(totals.pendingCents) : dash}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
