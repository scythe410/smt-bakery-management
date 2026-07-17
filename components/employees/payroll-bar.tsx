"use client";

// PayrollBar — the FN2 status bar, now reflecting DAILY-pay status for the
// selected pay-day (SPEC §4.3, owner-only). Shows the total PAID so far that day,
// a paid-vs-total progress bar, and the pending count. Only rendered when at
// least one employee has a daily rate set.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";
import type { PayrollDay } from "@/lib/db/selectors/employees";

export function PayrollBar({ payroll }: { payroll: PayrollDay }) {
  const { t } = useTranslation();

  if (payroll.employeesWithRate === 0) return null;

  const pct =
    payroll.employeesWithRate > 0
      ? Math.round((payroll.paidCount / payroll.employeesWithRate) * 100)
      : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-h2 text-ink">{t("employees.payroll.label")}</span>
        <span className="text-label font-semibold text-ink tabular-nums">
          {formatLKR(payroll.totalPaidCents)}
        </span>
      </div>

      {/* Progress bar */}
      <div>
        <div className="bg-border h-2.5 w-full overflow-hidden rounded-pill">
          <div
            className="bg-brand h-full rounded-pill transition-all duration-300"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={payroll.paidCount}
            aria-valuemin={0}
            aria-valuemax={payroll.employeesWithRate}
            aria-label={t("employees.payroll.progress", {
              paid: payroll.paidCount,
              total: payroll.employeesWithRate,
            })}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-muted">
          {t("employees.payroll.pending", { count: payroll.pendingCount })}
        </span>
        <span className="text-caption text-success font-medium">
          {t("employees.payroll.paidOf", {
            paid: payroll.paidCount,
            total: payroll.employeesWithRate,
          })}
        </span>
      </div>
    </Card>
  );
}
