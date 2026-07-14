"use client";

// PayrollBar — monthly payroll summary at the top of the Employees screen
// (SPEC §4.3, owner-only). Shows total payroll, paid-vs-pending count, and a
// progress bar. Only rendered when at least one employee has a salary set.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/format";
import type { PayrollSummary } from "@/lib/db/selectors/employees";

export function PayrollBar({ payroll }: { payroll: PayrollSummary }) {
  const { t } = useTranslation();

  if (payroll.employeesWithSalary === 0) return null;

  const pct =
    payroll.employeesWithSalary > 0
      ? Math.round((payroll.paidCount / payroll.employeesWithSalary) * 100)
      : 0;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-h2 text-ink">{t("employees.payroll.label")}</span>
        <span className="text-label font-semibold text-ink tabular-nums">
          {formatLKR(payroll.totalCents)}
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
            aria-valuemax={payroll.employeesWithSalary}
            aria-label={t("employees.payroll.progress", {
              paid: payroll.paidCount,
              total: payroll.employeesWithSalary,
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
            total: payroll.employeesWithSalary,
          })}
        </span>
      </div>
    </Card>
  );
}
