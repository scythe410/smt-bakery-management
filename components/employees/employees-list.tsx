"use client";

// Employees directory (SPEC §4.3). Renders the tenant's staff as stacked cards:
// name/title, permissions, shift schedule, and (owner-only) salary + pay status.
//
// Salary and payroll bar are gated by `isOwner` read from AppContext — consistent
// with CF5/CLAUDE.md §5: aggregate/money figures are owner-only; managers and
// staff see the directory only. Employee names, titles, and permission labels
// use i18n where applicable; dynamic business content (names, job titles) is not
// translated (CLAUDE.md §3).

import { useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { PayrollBar } from "@/components/employees/payroll-bar";
import { markEmployeePaid } from "@/app/(app)/employees/actions";
import { useAppContext } from "@/components/app/app-provider";
import { formatLKR } from "@/lib/format";
import type { EmployeeListItem, PayrollSummary, PayStatus } from "@/lib/db/selectors/employees";

const KNOWN_PERMISSIONS = new Set([
  "all",
  "orders",
  "inventory",
  "menu",
  "bookings",
  "reports",
  "finance",
  "settings",
]);

const PAY_STATUS_TONE: Record<PayStatus, "success" | "warning" | "neutral"> = {
  paid: "success",
  pending: "warning",
  not_set: "neutral",
};

// Per-employee salary + toggle (rendered only for owner when salary is configured).
function SalaryCell({
  empId,
  salaryCents,
  initialStatus,
}: {
  empId: string;
  salaryCents: number;
  initialStatus: PayStatus;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PayStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  function toggle() {
    const nextPaid = status !== "paid";
    const next: PayStatus = nextPaid ? "paid" : "pending";
    setStatus(next); // optimistic
    startTransition(async () => {
      const result = await markEmployeePaid(empId, nextPaid);
      if (result.error) setStatus(status); // revert on error
    });
  }

  return (
    <div className="border-border flex items-center justify-between gap-2 border-t pt-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-caption text-muted">{t("employees.payroll.salary")}</span>
        <span className="text-label font-semibold text-ink tabular-nums">
          {formatLKR(salaryCents)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <StatusPill
          tone={PAY_STATUS_TONE[status]}
          label={t(`employees.payroll.status.${status}`)}
        />
        <button
          type="button"
          onClick={toggle}
          disabled={isPending}
          className="text-caption text-brand hover:text-brand-ember font-medium transition-colors disabled:opacity-40"
        >
          {status === "paid"
            ? t("employees.payroll.markPending")
            : t("employees.payroll.markPaid")}
        </button>
      </div>
    </div>
  );
}

export function EmployeesList({
  items,
  payroll,
}: {
  items: EmployeeListItem[];
  payroll: PayrollSummary;
}) {
  const { t } = useTranslation();
  const { profile } = useAppContext();
  const isOwner = profile.role === "owner";

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-body text-muted">{t("employees.empty")}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Owner-only payroll status bar */}
      {isOwner ? <PayrollBar payroll={payroll} /> : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-muted">
          {t("employees.count", { count: items.length })}
        </p>
      </div>

      {items.map((emp) => (
        <Card key={emp.id} className="flex flex-col gap-3">
          {/* Identity: name + job title, login-account marker. */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="text-h2 text-ink">{emp.name}</span>
              <span className="text-label text-muted">
                {emp.role ?? t("employees.roleUnset")}
              </span>
            </div>
            {emp.hasLogin ? (
              <StatusPill
                tone="info"
                label={
                  <span className="inline-flex items-center gap-1">
                    <UserCheck className="size-3" aria-hidden />
                    {t("employees.hasLogin")}
                  </span>
                }
              />
            ) : null}
          </div>

          {/* Permissions. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted inline-flex items-center gap-1">
              <ShieldCheck className="size-3.5" aria-hidden />
              {t("employees.permissions")}
            </span>
            {emp.permissions.length === 0 ? (
              <span className="text-caption text-faint">{t("employees.noPermissions")}</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {emp.permissions.map((perm) => (
                  <StatusPill
                    key={perm}
                    tone={perm === "all" ? "success" : "neutral"}
                    label={
                      KNOWN_PERMISSIONS.has(perm) ? t(`employees.permission.${perm}`) : perm
                    }
                  />
                ))}
              </div>
            )}
          </div>

          {/* Weekly shift schedule. */}
          <div className="flex flex-col gap-1.5">
            <span className="text-caption text-muted inline-flex items-center gap-1">
              <CalendarClock className="size-3.5" aria-hidden />
              {t("employees.shift")}
            </span>
            {emp.shift.length === 0 ? (
              <span className="text-caption text-faint">{t("employees.noShift")}</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {emp.shift.map(({ day, hours }) => (
                  <span
                    key={day}
                    className="bg-surface-2 border-border text-caption text-ink inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-2 py-1"
                  >
                    <span className="text-muted font-medium uppercase">
                      {t(`employees.weekday.${day}`)}
                    </span>
                    <span className="tabular-nums">{hours}</span>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Owner-only salary + pay toggle. */}
          {isOwner ? (
            emp.salaryCents !== null ? (
              <SalaryCell
                empId={emp.id}
                salaryCents={emp.salaryCents}
                initialStatus={emp.payStatus}
              />
            ) : (
              <p className="border-border text-caption text-faint border-t pt-3">
                {t("employees.payroll.notSet")}
              </p>
            )
          ) : null}
        </Card>
      ))}

      <p className="text-caption text-faint px-1">{t("employees.scopeNote")}</p>
    </div>
  );
}
