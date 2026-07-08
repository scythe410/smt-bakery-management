"use client";

// Est. Net Profit Today — hero money figure with sign-aware color (DESIGN.md §1,
// §2): positive net in confident green (--success), zero/negative in Ember
// (--danger). Below it, the Income / Expenses two-line breakdown from the spec
// (SPEC §3.1). The selector guarantees income − expenses === est. net profit, so
// the breakdown always reconciles with the figure above. "Est." is in the label
// because COGS is derived from the BOM, not actual lot costs (CLAUDE.md §3).

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";

export function NetProfitCard({
  estNetProfitCents,
  incomeCents,
  expensesCents,
}: {
  estNetProfitCents: number;
  incomeCents: number;
  expensesCents: number;
}) {
  const { t } = useTranslation();
  const figureColor = estNetProfitCents > 0 ? "text-success" : "text-danger";

  return (
    <Card>
      <p className="text-caption text-muted tracking-wide uppercase">
        {t("dashboard.estNetProfit")}
      </p>
      <p className={`font-display text-display-xl mt-1 tabular-nums ${figureColor}`}>
        {formatLKR(estNetProfitCents)}
      </p>

      <dl className="border-border mt-3 flex flex-col gap-1.5 border-t pt-3">
        <div className="flex items-center justify-between gap-3">
          <dt className="text-label text-muted">{t("dashboard.income")}</dt>
          <dd className="text-label text-ink tabular-nums">{formatLKR(incomeCents)}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-label text-muted">{t("dashboard.expenses")}</dt>
          <dd className="text-label text-ink tabular-nums">{formatLKR(expensesCents)}</dd>
        </div>
      </dl>
    </Card>
  );
}
