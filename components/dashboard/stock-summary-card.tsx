"use client";

// Today's merchandise stock-take summary on the Dashboard (SPEC §3.1). Shows the
// day's state and — once closed — units out / left and merchandise revenue
// (owner/manager only; staff see the counts without money, CLAUDE.md §5). Links to
// the stock-take screen so the owner can open/close from here. Money is
// pre-computed integer cents; formatLKR is render-time only.

import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { formatLKR } from "@/lib/format";
import type { StockDaySummary } from "@/lib/db/selectors/stock";

const QTY_FMT = new Intl.NumberFormat("en-US", { maximumFractionDigits: 3 });

export function StockSummaryCard({
  summary,
  canSeeRevenue,
}: {
  summary: StockDaySummary;
  canSeeRevenue: boolean;
}) {
  const { t } = useTranslation();
  const tone = summary.status === "closed" ? "success" : summary.status === "open" ? "warning" : "neutral";

  return (
    <Link href="/inventory/stock-take" className="block">
      <Card className="hover:bg-surface-2 flex flex-col gap-3 transition-colors">
        <div className="flex items-center justify-between gap-2">
          <span className="text-caption text-muted flex items-center gap-1.5 tracking-wide uppercase">
            <ClipboardList className="size-4" aria-hidden />
            {t("stock.dashboard.title")}
          </span>
          <StatusPill tone={tone} label={t(`stock.status.${summary.status}`)} />
        </div>

        {summary.status === "none" ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-body text-muted">{t("stock.dashboard.notOpened")}</p>
            <ChevronRight className="text-faint size-4 shrink-0" aria-hidden />
          </div>
        ) : (
          <div className="flex items-end justify-between gap-3">
            {canSeeRevenue ? (
              <div>
                <p className="text-caption text-muted">{t("stock.stats.revenue")}</p>
                <p className="font-display text-display-lg text-success tabular-nums">
                  {formatLKR(summary.totalRevenueCents)}
                </p>
              </div>
            ) : (
              <div>
                <p className="text-caption text-muted">{t("stock.stats.items")}</p>
                <p className="font-display text-display-lg text-ink tabular-nums">{summary.itemCount}</p>
              </div>
            )}
            <dl className="text-caption text-muted flex flex-col items-end gap-0.5 tabular-nums">
              <div className="flex gap-1">
                <dt>{t("stock.col.out")}:</dt>
                <dd className="text-ink">{QTY_FMT.format(summary.totalUnitsOut)}</dd>
              </div>
              <div className="flex gap-1">
                <dt>{t("stock.col.left")}:</dt>
                <dd className="text-ink">{QTY_FMT.format(summary.totalLeftQty)}</dd>
              </div>
            </dl>
          </div>
        )}
      </Card>
    </Link>
  );
}
