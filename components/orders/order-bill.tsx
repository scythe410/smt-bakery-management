"use client";

// Order bill / receipt component (SPEC §3.4). Pure layout: all money and dates
// arrive pre-formatted in OrderBillData so this component is dependency-free
// and the react-pdf FT4 route can consume the same data shape with its own
// render target (see lib/db/selectors/order-bill.ts).
//
// Font weights are deliberately heavier than the rest of the app (client
// requirement: legible on a printed receipt). Body text uses font-semibold (600)
// as the floor; totals use font-extrabold (800). On print, @media print rules
// in globals.css constrain the receipt to 80 mm and strip shadows.

import Image from "next/image";
import { useTranslation } from "react-i18next";
import { BrandLogo } from "@/components/ui/brand-logo";
import type { OrderBillData } from "@/lib/db/selectors/order-bill";

export function OrderBill({ data }: { data: OrderBillData }) {
  const { t } = useTranslation();
  const showCommission = data.commissionCents > 0;

  return (
    <div
      data-bill
      className="
        mx-auto max-w-[380px]
        rounded-[var(--radius)] border border-border bg-white shadow-card
        px-6 py-6
        print:max-w-none print:rounded-none print:border-0 print:shadow-none print:px-0 print:py-0
      "
    >
      {/* ── Business header ────────────────────────────────────────────────── */}
      <div className="mb-4 flex flex-col items-center gap-2 text-center">
        {data.businessLogoUrl ? (
          <div className="relative size-20 overflow-hidden rounded-xl">
            <Image
              src={data.businessLogoUrl}
              alt={data.businessName}
              fill
              className="object-contain"
              sizes="80px"
            />
          </div>
        ) : (
          <BrandLogo className="h-20" sizes="160px" alt={data.businessName} />
        )}
        <h1 className="text-xl font-extrabold text-ink leading-tight tracking-tight">
          {data.businessName}
        </h1>
      </div>

      <Divider />

      {/* ── Order metadata ─────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-1 text-sm">
        <Row label={t("orders.bill.orderNo")} value={data.orderNo} bold />
        <Row label={t("orders.bill.dateTime")} value={data.createdAtFmt} />
        <Row label={t("orders.bill.source")} value={t(`source.${data.source}`)} />
        <Row
          label={t("orders.bill.customer")}
          value={data.customerName ?? t("orders.bill.walkIn")}
        />
      </div>

      <Divider />

      {/* ── Line items ─────────────────────────────────────────────────────── */}
      <ul className="mb-3 flex flex-col gap-2">
        {data.lines.map((line, i) => (
          <li key={i} className="flex flex-col gap-0.5">
            <div className="flex items-start justify-between gap-2">
              <span className="flex-1 text-sm font-semibold text-ink leading-snug">
                {line.nameSnapshot}
              </span>
              <span className="shrink-0 text-sm font-bold tabular-nums text-ink">
                {line.lineTotalFmt}
              </span>
            </div>
            <span className="text-xs font-semibold text-muted tabular-nums">
              {line.qty} × {line.unitPriceFmt}
            </span>
          </li>
        ))}
      </ul>

      <Divider />

      {/* ── Totals ─────────────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-col gap-1 text-sm">
        <Row label={t("orders.bill.subtotal")} value={data.subtotalFmt} />
        {showCommission && (
          <Row label={t("orders.bill.commission")} value={data.commissionFmt} />
        )}
      </div>

      {/* Grand total — oversized, bolder, prominent */}
      <div className="flex items-baseline justify-between gap-2 border-t-2 border-ink pt-2">
        <span className="text-base font-extrabold uppercase tracking-wide text-ink">
          {t("orders.bill.total")}
        </span>
        <span className="text-xl font-extrabold tabular-nums text-ink">
          {data.totalFmt}
        </span>
      </div>

      <Divider className="mt-3" />

      {/* ── Payment info ───────────────────────────────────────────────────── */}
      <div className="mb-4 text-sm">
        <Row
          label={t("orders.bill.payment")}
          value={[
            data.paymentMethod ? t(`orders.payment.${data.paymentMethod}`) : null,
            t(`orders.paymentStatus.${data.paymentStatus}`),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <div className="mt-2 flex flex-col items-center gap-0.5 text-center">
        <p className="text-sm font-bold text-ink">{t("orders.bill.thankYou")}</p>
        <p className="text-xs font-semibold text-muted">{data.businessName}</p>
        {data.businessAddress ? (
          <p className="text-xs font-semibold text-muted">{data.businessAddress}</p>
        ) : null}
      </div>
    </div>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────────

function Divider({ className = "" }: { className?: string }) {
  return (
    <hr
      className={`my-3 border-0 border-t border-dashed border-border-strong ${className}`}
    />
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="font-semibold text-muted shrink-0">{label}</span>
      <span className={`text-right tabular-nums ${bold ? "font-bold text-ink" : "font-semibold text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
