"use client";

// Order detail view (SPEC §3.4). Shows full order info — metadata, line items,
// financial breakdown, payment — plus a "Reprint Bill" link to the existing
// CF4 bill/print path. Data arrives pre-computed from the server so this
// component is pure layout with no money math. All labels go through i18n
// (CLAUDE.md §3); dynamic content (item names, customer name) is not translated.

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pencil, Printer } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { NewOrderForm, type OrderFormMode } from "@/components/orders/new-order-form";
import type { OrderBillData } from "@/lib/db/selectors/order-bill";
import type { NewOrderMenuItem } from "@/lib/db/selectors/orders";
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

export function OrderDetail({
  data,
  orderId,
  menu = [],
}: {
  data: OrderBillData;
  orderId: string;
  /** Available menu for the edit form — passed only while the order is pending. */
  menu?: NewOrderMenuItem[];
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const showCommission = data.commissionCents > 0;
  const showDiscount = data.discountCents > 0;
  // Editable = pending only (completed/cancelled are immutable history; the
  // update_order RPC re-guards this server-side — migration 026).
  const canEdit = data.status === "pending" && menu.length > 0;

  const editMode: OrderFormMode = {
    kind: "edit",
    orderId,
    initial: {
      source: data.source,
      customerName: data.customerName,
      paymentMethod: data.paymentMethod,
      paymentStatus: data.paymentStatus,
      discountPct: data.discountPct,
      tenderedMajor: data.tenderedCents === null ? null : data.tenderedCents / 100,
      lines: data.lines.map((l) => ({
        menuItemId: l.menuItemId,
        nameSnapshot: l.nameSnapshot,
        qty: l.qty,
      })),
    },
  };

  const closeEdit = useCallback(() => {
    setEditing(false);
    // Pull the recomputed order (lines, totals) back into this server-rendered view.
    router.refresh();
  }, [router]);

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
        {canEdit ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            aria-expanded={editing}
            className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium transition-colors"
          >
            <Pencil className="size-4" aria-hidden />
            {t("orders.edit.action")}
          </button>
        ) : null}
        <Link
          href={`/orders/${orderId}/bill`}
          className="border-border-strong text-ink text-label hover:bg-surface-2 flex h-10 items-center gap-1.5 rounded-[var(--radius)] border px-3 font-medium transition-colors"
        >
          <Printer className="size-4" aria-hidden />
          {t("orders.detail.reprintBill")}
        </Link>
      </div>

      {/* Edit composer (pending orders only) — full-screen takeover */}
      {editing && canEdit ? (
        <NewOrderForm menu={menu} mode={editMode} onDone={closeEdit} />
      ) : null}

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
          {showDiscount ? (
            <TotalRow
              label={t("orders.bill.discount", { pct: data.discountPct })}
              value={`- ${data.discountFmt}`}
            />
          ) : null}
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
