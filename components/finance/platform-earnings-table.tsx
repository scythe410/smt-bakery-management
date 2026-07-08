"use client";

// Finance › Platform Earnings (SPEC §3.2). Commission the platform takes per
// order source, computed from commission_rule (the total equals the Overview's
// commission figure — same aggregate). Headline total, then a per-source
// breakdown: source pill, order count, gross revenue, rate, commission. Rates
// and money are pre-computed server-side; formatted here. Commission reads in
// ember (a deduction, DESIGN.md §2).

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import type { PlatformEarningRow } from "@/lib/db/selectors/finance";

/** Basis points → percent label, e.g. 1800 → "18%", 0 → "0%". */
function ratePercent(rateBps: number): string {
  const pct = rateBps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export function PlatformEarningsTable({
  rows,
  totalCommissionCents,
}: {
  rows: PlatformEarningRow[];
  totalCommissionCents: number;
}) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <p className="text-caption text-muted tracking-wide uppercase">
          {t("finance.platform.total")}
        </p>
        <p className="font-display text-display-lg text-brand-ember mt-1 tabular-nums">
          {formatLKR(totalCommissionCents)}
        </p>
        <p className="text-caption text-muted mt-2">{t("finance.platform.subtitle")}</p>
      </Card>

      {rows.length === 0 ? (
        <Card>
          <p className="text-body text-muted">{t("finance.platform.empty")}</p>
        </Card>
      ) : (
        <Card>
          <ul className="flex flex-col">
            {rows.map((r) => (
              <li
                key={r.source}
                className="border-border flex items-center justify-between gap-3 border-b py-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <StatusPill tone="neutral" label={t(`source.${r.source}`)} />
                  <p className="text-caption text-muted mt-1 tabular-nums">
                    {t("finance.platform.ordersCount", { count: r.orders })} ·{" "}
                    {formatLKR(r.grossCents)} · {ratePercent(r.rateBps)}
                  </p>
                </div>
                <span className="text-label text-brand-ember shrink-0 tabular-nums">
                  {formatLKR(r.commissionCents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
