"use client";

// Reports detail table + exports (SPEC §3.5). This is the one place DESIGN.md §4
// sanctions a real wide table on mobile ("Reports detail export preview"): the
// row set is what the CSV/print output is, so we show it as it exports, with
// horizontal scroll. Every order in the day appears with its status — the
// headline figures count completed orders only, so a pending/cancelled row is
// visible and labelled rather than silently dropped.
//
// Export CSV builds the file client-side from the already-derived rows (no money
// math — toMajor is render-time formatting, CLAUDE.md §3) and downloads it.
// Print / PDF hands off to the browser's print dialog (Save as PDF there).

import { Download, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import { toMajor } from "@/lib/money";
import type { ReportRow } from "@/lib/db/selectors/reports";
import type { OrderStatus, PaymentStatus } from "@/lib/orders/order-config";

const STATUS_TONE: Record<OrderStatus, Tone> = {
  pending: "warning",
  completed: "success",
  cancelled: "danger",
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, Tone> = {
  paid: "success",
  unpaid: "warning",
  refunded: "danger",
};

/** RFC-4180-ish CSV cell: wrap in quotes, double any embedded quote. */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function ReportDetail({
  rows,
  reportType,
  date,
}: {
  rows: ReportRow[];
  reportType: string;
  date: string;
}) {
  const { t } = useTranslation();

  const dash = t("reports.detail.none");

  function paymentLabel(method: ReportRow["paymentMethod"]): string {
    return method ? t(`orders.payment.${method}`) : dash;
  }

  function exportCsv() {
    const headers = [
      t("reports.detail.time"),
      t("reports.detail.source"),
      t("reports.detail.customer"),
      t("reports.detail.items"),
      t("reports.detail.total"),
      t("reports.detail.payment"),
      t("reports.detail.paymentStatus"),
      t("reports.detail.status"),
    ];
    const body = rows.map((r) =>
      [
        r.time,
        t(`source.${r.source}`),
        r.customerName ?? "",
        r.itemCount,
        toMajor(r.totalCents).toFixed(2),
        paymentLabel(r.paymentMethod),
        t(`orders.paymentStatus.${r.paymentStatus}`),
        t(`orders.status.${r.status}`),
      ]
        .map(csvCell)
        .join(","),
    );
    const csv = [headers.map(csvCell).join(","), ...body].join("\r\n");

    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${reportType.replace(/_/g, "-")}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const th = "text-caption text-muted px-2 py-2 text-left font-medium tracking-wide uppercase";
  const td = "text-label text-ink px-2 py-2 align-top";

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-h2 text-ink">{t("reports.detail.title")}</p>
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
        <p className="text-body text-muted py-2">{t("reports.detail.empty")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full border-collapse tabular-nums">
            <thead>
              <tr className="border-border border-b">
                <th className={th}>{t("reports.detail.time")}</th>
                <th className={th}>{t("reports.detail.source")}</th>
                <th className={th}>{t("reports.detail.customer")}</th>
                <th className={`${th} text-right`}>{t("reports.detail.items")}</th>
                <th className={`${th} text-right`}>{t("reports.detail.total")}</th>
                <th className={th}>{t("reports.detail.payment")}</th>
                <th className={th}>{t("reports.detail.status")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-border border-b last:border-0">
                  <td className={`${td} whitespace-nowrap`}>{r.time}</td>
                  <td className={td}>
                    <StatusPill tone="neutral" label={t(`source.${r.source}`)} />
                  </td>
                  <td className={`${td} max-w-32 truncate`}>{r.customerName ?? dash}</td>
                  <td className={`${td} text-right`}>{r.itemCount}</td>
                  <td className={`${td} text-right whitespace-nowrap font-semibold`}>
                    {formatLKR(r.totalCents)}
                  </td>
                  <td className={`${td} whitespace-nowrap`}>
                    <span className="flex flex-col gap-1">
                      <span>{paymentLabel(r.paymentMethod)}</span>
                      <StatusPill
                        tone={PAYMENT_STATUS_TONE[r.paymentStatus]}
                        label={t(`orders.paymentStatus.${r.paymentStatus}`)}
                      />
                    </span>
                  </td>
                  <td className={td}>
                    <StatusPill tone={STATUS_TONE[r.status]} label={t(`orders.status.${r.status}`)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
