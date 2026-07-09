"use client";

// Reports breakdowns (SPEC §3.5): By Source and By Payment, each a list of
// "pill — N orders — LKR total" rows. Both are the report's realized totals
// sliced two ways, so each list sums back to the headline Revenue — the same
// aggregate that feeds Dashboard and Finance (selectors/_shared.ts). Money is
// pre-computed in the selector and only formatted here (formatLKR).

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import type { PaymentBreakdown, SourceBreakdown } from "@/lib/db/selectors/_shared";

function BreakdownRow({
  label,
  orders,
  totalCents,
}: {
  label: string;
  orders: number;
  totalCents: number;
}) {
  const { t } = useTranslation();
  return (
    <li className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2">
        <StatusPill tone="neutral" label={label} />
        <span className="text-caption text-muted tabular-nums">
          {t("reports.breakdown.ordersCount", { count: orders })}
        </span>
      </div>
      <span className="text-label text-ink shrink-0 tabular-nums">{formatLKR(totalCents)}</span>
    </li>
  );
}

export function ReportBreakdowns({
  bySource,
  byPayment,
}: {
  bySource: SourceBreakdown[];
  byPayment: PaymentBreakdown[];
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-col gap-1">
        <p className="text-caption text-muted tracking-wide uppercase">
          {t("reports.breakdown.bySource")}
        </p>
        {bySource.length === 0 ? (
          <p className="text-body text-muted py-2">{t("reports.breakdown.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {bySource.map((s) => (
              <BreakdownRow
                key={s.source}
                label={t(`source.${s.source}`)}
                orders={s.orders}
                totalCents={s.grossCents}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card className="flex flex-col gap-1">
        <p className="text-caption text-muted tracking-wide uppercase">
          {t("reports.breakdown.byPayment")}
        </p>
        {byPayment.length === 0 ? (
          <p className="text-body text-muted py-2">{t("reports.breakdown.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {byPayment.map((p) => (
              <BreakdownRow
                key={p.method}
                label={
                  p.method === "unknown"
                    ? t("reports.breakdown.noMethod")
                    : t(`orders.payment.${p.method}`)
                }
                orders={p.orders}
                totalCents={p.grossCents}
              />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
