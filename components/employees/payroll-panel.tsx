"use client";

// PayrollPanel — the owner-only "approve / pay salary" area (SPEC §4.3, client:
// DAILY pay). Pick a pay-day (URL-driven, like Reports), then per employee with a
// daily rate: optionally add a bonus and Approve & Pay. Approving snapshots the
// rate, sets the record paid, and posts a LINKED 'Salaries' expense in one RPC
// (the payment IS that expense — single source of truth, CLAUDE.md §8). Unapprove
// reverses the expense (back to pending); Delete removes the record and its
// expense. The client sends only the employee, the day, and the bonus — never a
// base or a total; the server recomputes (CLAUDE.md §3/§7).

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CalendarDays, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { PayrollBar } from "@/components/employees/payroll-bar";
import {
  approveSalary,
  reverseSalary,
  deleteSalaryPayment,
} from "@/app/(app)/employees/actions";
import { formatLKR } from "@/lib/format";
import type { PayrollDay, PayrollDayEmployee } from "@/lib/db/selectors/employees";

export function PayrollPanel({ payrollDay }: { payrollDay: PayrollDay }) {
  const { t } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setPayDate(next: string) {
    if (!next) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("payDate", next);
    router.push(`${pathname}?${params.toString()}`);
  }

  const rated = payrollDay.rows.filter((r) => r.dailyPayCents !== null);

  return (
    <div className="flex flex-col gap-3">
      <PayrollBar payroll={payrollDay} />

      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-h2 text-ink">{t("employees.payroll.approveTitle")}</span>
        </div>

        {/* Pay-day picker */}
        <label className="flex items-center gap-2">
          <span className="text-caption text-muted inline-flex w-16 shrink-0 items-center gap-1 tracking-wide uppercase">
            <CalendarDays className="size-3.5" aria-hidden />
            {t("employees.payroll.payDate")}
          </span>
          <input
            type="date"
            value={payrollDay.payDate}
            onChange={(e) => setPayDate(e.target.value)}
            className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 flex-1 rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
          />
        </label>

        {rated.length === 0 ? (
          <p className="text-caption text-faint">{t("employees.payroll.noneWithRate")}</p>
        ) : (
          <div className="flex flex-col">
            {rated.map((row) => (
              <PayrollRow key={row.employeeId} row={row} payDate={payrollDay.payDate} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PayrollRow({ row, payDate }: { row: PayrollDayEmployee; payDate: string }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [bonus, setBonus] = useState("");
  // Collapsed by default: the common case is "approve, no bonus" — one line,
  // one tap. The bonus input only appears when explicitly opened, so a roster
  // of a dozen people doesn't render a dozen always-visible text inputs
  // (client feedback: employees section UX was bad with a real-size roster).
  const [bonusOpen, setBonusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const paid = row.payment?.status === "paid";

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await fn();
      if (result.error) setError(result.error);
      else {
        setBonus("");
        setBonusOpen(false);
        router.refresh();
      }
    });
  }

  function approve() {
    // Whole-rupee bonus → cents; blank means no bonus. The server recomputes the
    // authoritative base + total from the stored rate.
    const trimmed = bonus.trim();
    let bonusCents = 0;
    if (trimmed !== "") {
      const rupees = parseInt(trimmed, 10);
      if (!Number.isFinite(rupees) || rupees < 0) {
        setError("employees.payroll.error");
        return;
      }
      bonusCents = rupees * 100;
    }
    run(() => approveSalary(row.employeeId, payDate, bonusCents));
  }

  return (
    <div className="border-border flex flex-col gap-2 border-t py-2.5 first:border-t-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-label text-ink truncate font-medium">{row.name}</span>
          <span className="text-caption text-muted">
            {t("employees.payroll.dailyRate")} · {formatLKR(row.dailyPayCents ?? 0)}
          </span>
        </div>

        {paid ? (
          <StatusPill tone="success" label={t("employees.payroll.status.paid")} />
        ) : !bonusOpen ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {/* A leftover pending record (from a prior Unapprove) can be deleted
                outright without reopening the bonus flow. */}
            {row.payment ? (
              <button
                type="button"
                onClick={() => run(() => deleteSalaryPayment(row.payment!.id))}
                disabled={isPending}
                aria-label={t("employees.payroll.delete")}
                className="text-danger transition-colors disabled:opacity-40"
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setBonusOpen(true)}
              className="border-border-strong text-muted hover:text-ink text-caption inline-flex h-8 items-center gap-1 rounded-[var(--radius)] border px-2 font-medium transition-colors"
            >
              <Plus className="size-3.5" aria-hidden />
              {t("employees.payroll.addBonus")}
            </button>
            <button
              type="button"
              onClick={approve}
              disabled={isPending}
              className="bg-brand text-brand-white hover:bg-brand-ember text-caption h-8 rounded-[var(--radius)] px-3 font-semibold transition-colors disabled:opacity-50"
            >
              {t("employees.payroll.approvePay")}
            </button>
          </div>
        ) : null}
      </div>

      {paid && row.payment ? (
        <div className="flex items-center justify-between gap-2">
          <div className="text-caption text-muted flex flex-col gap-0.5 tabular-nums">
            <span>
              {t("employees.payroll.base")}: {formatLKR(row.payment.baseCents)}
              {row.payment.bonusCents > 0
                ? ` · ${t("employees.payroll.bonus")}: ${formatLKR(row.payment.bonusCents)}`
                : ""}
            </span>
            <span className="text-label text-ink font-semibold">
              {t("employees.payroll.total")}: {formatLKR(row.payment.totalCents)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => run(() => reverseSalary(row.payment!.id))}
              disabled={isPending}
              className="border-border-strong text-ink hover:bg-surface-2 text-caption inline-flex h-8 items-center gap-1 rounded-[var(--radius)] border px-2 font-medium transition-colors disabled:opacity-40"
            >
              <RotateCcw className="size-3.5" aria-hidden />
              {t("employees.payroll.unapprove")}
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteSalaryPayment(row.payment!.id))}
              disabled={isPending}
              aria-label={t("employees.payroll.delete")}
              className="text-danger transition-colors disabled:opacity-40"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : bonusOpen ? (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-caption text-muted">{t("employees.payroll.bonusOptional")}</span>
            <input
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={bonus}
              autoFocus
              onChange={(e) => setBonus(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="0"
              className="border-border text-label text-ink focus-visible:ring-brand/40 bg-surface h-9 w-full rounded-[var(--radius)] border px-2 outline-none focus-visible:ring-2"
            />
          </label>
          <button
            type="button"
            onClick={approve}
            disabled={isPending}
            className="bg-brand text-brand-white hover:bg-brand-ember text-caption h-9 shrink-0 rounded-[var(--radius)] px-3 font-semibold transition-colors disabled:opacity-50"
          >
            {t("employees.payroll.approvePay")}
          </button>
          <button
            type="button"
            onClick={() => {
              setBonus("");
              setBonusOpen(false);
            }}
            disabled={isPending}
            aria-label={t("employees.payroll.cancelBonus")}
            className="text-muted hover:text-ink h-9 shrink-0 transition-colors disabled:opacity-40"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="text-caption text-danger">
          {t(error)}
        </p>
      ) : null}
    </div>
  );
}
