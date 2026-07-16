"use client";

// Order detail view (SPEC §3.4). Shows full order info — metadata, line items,
// financial breakdown, payment — plus a "Reprint Bill" link to the existing
// CF4 bill/print path. Data arrives pre-computed from the server so this
// component is pure layout with no money math. All labels go through i18n
// (CLAUDE.md §3); dynamic content (item names, customer name) is not translated.

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import type { OrderBillData } from "@/lib/db/selectors/order-bill";
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

export function OrderDetail({ data, orderId }: { data: OrderBillData; orderId: string }) {
  const { t } = useTranslation();
  const showCommission = data.commissionCents > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Action bar */}
      <div className="flex items-center gap-2">
        <Link
          href="/orders"
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium transition-colors"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {t("orders.detail.back")}
        </Link>
        <div className="flex-1" />
        <Link
          href={`/orders/${orderId}/bill`}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium transition-colors"
        >
          <Printer className="size-4" aria-hidden />
          {t("orders.detail.reprintBill")}
        </Link>
      </div>

      {/* Order header */}
      <Card className="flex flex-col gap-2.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-caption text-muted uppercase tracking-wide">
              {t("orders.bill.orderNo")}
            </p>
            <p className="text-h2 text-ink font-bold tabular-nums">{data.orderNo}</p>
          </div>
          <StatusPill tone={STATUS_TONE[data.status]} label={t(`orders.status.${data.status}`)} />
        </div>
        <div className="border-border border-t pt-2.5 flex flex-col gap-1.5">
          <MetaRow label={t("orders.bill.dateTime")} value={data.createdAtFmt} />
          <MetaRow label={t("orders.bill.source")} value={t(`source.${data.source}`)} />
          <MetaRow
            label={t("orders.bill.customer")}
            value={data.customerName ?? t("orders.bill.walkIn")}
          />
        </div>
      </Card>

      {/* Line items */}
      <Card className="flex flex-col gap-2">
        <p className="text-h2 text-ink">{t("orders.detail.items")}</p>
        <ul className="flex flex-col">
          {data.lines.map((line, i) => (
            <li
              key={i}
              className="border-border flex items-start justify-between gap-3 border-b py-2.5 last:border-0 last:pb-0"
            >
              <div className="min-w-0">
                <p className="text-label text-ink font-medium leading-snug">{line.nameSnapshot}</p>
                <p className="text-caption text-muted tabular-nums">
                  {line.qty} × {line.unitPriceFmt}
                </p>
              </div>
              <span className="text-label text-ink shrink-0 tabular-nums font-semibold">
                {line.lineTotalFmt}
              </span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Totals + payment */}
      <Card className="flex flex-col gap-2">
        <p className="text-h2 text-ink">{t("orders.detail.totals")}</p>
        <div className="flex flex-col gap-1.5">
          <TotalRow label={t("orders.bill.subtotal")} value={data.subtotalFmt} />
          {showCommission ? (
            <TotalRow label={t("orders.bill.commission")} value={data.commissionFmt} />
          ) : null}
          <div className="border-border-strong border-t pt-2 mt-0.5">
            <TotalRow label={t("orders.bill.total")} value={data.totalFmt} bold />
          </div>
        </div>

        <div className="border-border border-t pt-2.5 flex flex-wrap items-center gap-2">
          {data.paymentMethod ? (
            <StatusPill tone="neutral" label={t(`orders.payment.${data.paymentMethod}`)} />
          ) : null}
          <StatusPill
            tone={PAYMENT_STATUS_TONE[data.paymentStatus as PaymentStatus] ?? "neutral"}
            label={t(`orders.paymentStatus.${data.paymentStatus}`)}
          />
        </div>
      </Card>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-caption text-muted shrink-0">{label}</span>
      <span className="text-caption text-ink text-right">{value}</span>
    </div>
  );
}

function TotalRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className={`text-label ${bold ? "text-ink font-bold" : "text-muted"}`}>{label}</span>
      <span className={`text-label tabular-nums ${bold ? "text-ink font-bold" : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
