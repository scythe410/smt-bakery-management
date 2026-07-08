"use client";

// Orders Today — 2×2 stat grid (SPEC §3.1, DESIGN.md §4). Four blocks, each an
// icon chip + count + label, tone-coded: Total neutral, Completed success,
// Pending warning, Cancelled danger. Counts come pre-tallied from the selector.

import { useTranslation } from "react-i18next";
import { CheckCircle2, Clock, ShoppingBag, XCircle, type LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { StatusCounts } from "@/lib/db/selectors/_shared";
import type { Tone } from "@/components/ui/status-pill";

type Cell = { key: keyof StatusCounts; labelKey: string; icon: LucideIcon; tone: Tone };

// Order matches the reference 2×2 reading order: Total, Completed / Pending, Cancelled.
const CELLS: Cell[] = [
  { key: "total", labelKey: "dashboard.orderStatus.total", icon: ShoppingBag, tone: "neutral" },
  {
    key: "completed",
    labelKey: "dashboard.orderStatus.completed",
    icon: CheckCircle2,
    tone: "success",
  },
  { key: "pending", labelKey: "dashboard.orderStatus.pending", icon: Clock, tone: "warning" },
  { key: "cancelled", labelKey: "dashboard.orderStatus.cancelled", icon: XCircle, tone: "danger" },
];

const CHIP_CLASSES: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-bg text-success",
  warning: "bg-warning-bg text-warning",
  danger: "bg-danger-bg text-danger",
  info: "bg-info-bg text-info",
};

export function OrdersTodayGrid({ orders }: { orders: StatusCounts }) {
  const { t } = useTranslation();
  return (
    <Card>
      <p className="text-caption text-muted tracking-wide uppercase">
        {t("dashboard.ordersToday")}
      </p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {CELLS.map(({ key, labelKey, icon: Icon, tone }) => (
          <div key={key} className="flex items-center gap-3">
            <span
              className={`flex size-9 shrink-0 items-center justify-center rounded-[10px] ${CHIP_CLASSES[tone]}`}
            >
              <Icon className="size-5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="font-display text-h1 text-ink leading-none tabular-nums">
                {orders[key]}
              </p>
              <p className="text-caption text-muted mt-0.5 truncate">{t(labelKey)}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
