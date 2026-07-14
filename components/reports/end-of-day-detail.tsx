"use client";

// End-of-Day detail table + exports. Like ReportDetail, this is the one place
// DESIGN.md §4 sanctions a real wide table on mobile (it's the export preview):
// per merchandise item — opening, received, out, left, price, revenue — with a
// billing cross-check (billed / variance) appended only when merchandise is billed
// through orders. Export CSV builds the file client-side from the already-derived
// rows (toMajor is render-time formatting, CLAUDE.md §3); Print / PDF hands off to
// the browser dialog. Item names are business data, shown as entered — not
// translated.

import { Download, Printer, AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { csvRow } from "@/lib/csv";
import { formatLKR } from "@/lib/format";
import { toMajor } from "@/lib/money";
import type { EndOfDayRow } from "@/lib/db/selectors/stock";

const QTY_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

function q(n: number | null): string {
  return n === null ? "—" : QTY_FMT.format(n);
}

export function EndOfDayDetail({
  rows,
  billed,
  date,
}: {
  rows: EndOfDayRow[];
  billed: boolean;
  date: string;
}) {
  const { t } = useTranslation();

  function exportCsv() {
    const headers = [
      t("stock.detail.item"),
      t("stock.col.opening"),
      t("stock.col.received"),
      t("stock.col.out"),
      t("stock.col.left"),
      t("stock.col.price"),
      t("stock.stats.revenue"),
      ...(billed ? [t("stock.detail.billed"), t("stock.detail.variance")] : []),
    ];
    const body = rows.map((r) =>
      csvRow([
        r.name,
        r.openingQty,
        r.receivedQty,
        r.unitsOut ?? "",
        r.leftQty ?? "",
        toMajor(r.unitPriceCents).toFixed(2),
        r.revenueCents === null ? "" : toMajor(r.revenueCents).toFixed(2),
        ...(billed ? [r.billedUnits, r.varianceUnits ?? ""] : []),
      ]),
    );
    const csv = [csvRow(headers), ...body].join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `end-of-day-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "text-caption text-muted px-2 py-2 text-left font-medium tracking-wide uppercase";
  const td = "text-label text-ink px-2 py-2 align-top tabular-nums";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-h2 text-ink">{t("stock.detail.title")}</p>
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
          <button
            type="button"
            onClick={() => window.print()}
            className="border-border-strong text-label text-ink hover:bg-surface-2 focus-visible:ring-brand/40 flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium outline-none transition-colors focus-visible:ring-2"
          >
            <Printer className="size-4" aria-hidden />
            {t("reports.actions.print")}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-body text-muted py-2">{t("stock.detail.empty")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-border border-b">
                <th className={th}>{t("stock.detail.item")}</th>
                <th className={`${th} text-right`}>{t("stock.col.opening")}</th>
                <th className={`${th} text-right`}>{t("stock.col.received")}</th>
                <th className={`${th} text-right`}>{t("stock.col.out")}</th>
                <th className={`${th} text-right`}>{t("stock.col.left")}</th>
                <th className={`${th} text-right`}>{t("stock.col.price")}</th>
                <th className={`${th} text-right`}>{t("stock.stats.revenue")}</th>
                {billed ? <th className={`${th} text-right`}>{t("stock.detail.billed")}</th> : null}
                {billed ? <th className={`${th} text-right`}>{t("stock.detail.variance")}</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const shrink = r.varianceUnits !== null && r.varianceUnits > 0;
                return (
                  <tr key={r.itemId} className="border-border border-b last:border-0">
                    <td className="text-label text-ink max-w-32 truncate px-2 py-2 align-top font-medium">
                      {r.name}
                    </td>
                    <td className={`${td} text-right`}>{q(r.openingQty)}</td>
                    <td className={`${td} text-right`}>{q(r.receivedQty)}</td>
                    <td className={`${td} text-right`}>{q(r.unitsOut)}</td>
                    <td className={`${td} text-right`}>{q(r.leftQty)}</td>
                    <td className={`${td} text-right`}>{formatLKR(r.unitPriceCents)}</td>
                    <td className={`${td} text-success text-right font-semibold`}>
                      {r.revenueCents === null ? "—" : formatLKR(r.revenueCents)}
                    </td>
                    {billed ? <td className={`${td} text-right`}>{q(r.billedUnits)}</td> : null}
                    {billed ? (
                      <td className={`${td} text-right ${shrink ? "text-danger font-semibold" : ""}`}>
                        <span className="inline-flex items-center gap-1">
                          {shrink ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
                          {r.varianceUnits === null
                            ? "—"
                            : `${r.varianceUnits > 0 ? "+" : ""}${QTY_FMT.format(r.varianceUnits)}`}
                        </span>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
