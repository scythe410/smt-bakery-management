"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { CalendarClock, Coins, Pencil, Plus, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import { PayrollPanel } from "@/components/employees/payroll-panel";
import { EmployeeForm } from "@/components/employees/employee-form";
import { deleteEmployee } from "@/app/(app)/employees/actions";
import { useAppContext } from "@/components/app/app-provider";
import { formatLKR } from "@/lib/format";
import type { EmployeeListItem, PayrollDay } from "@/lib/db/selectors/employees";
import type { LinkableAccount } from "@/lib/db/queries/employees";

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

export function EmployeesList({
  items,
  payrollDay,
  linkableAccounts,
}: {
  items: EmployeeListItem[];
  payrollDay: PayrollDay;
  linkableAccounts: LinkableAccount[];
}) {
  const { t } = useTranslation();
  const { profile } = useAppContext();
  const router = useRouter();
  const isOwner = profile.role === "owner";

  const [creating, setCreating] = useState(false);
  const [editingEmp, setEditingEmp] = useState<EmployeeListItem | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function handleDelete(emp: EmployeeListItem) {
    if (!window.confirm(t("employees.form.deleteConfirm", { name: emp.name }))) return;
    setDeletingId(emp.id);
    startTransition(async () => {
      await deleteEmployee(emp.id);
      setDeletingId(null);
      router.refresh();
    });
  }

  if (creating || editingEmp) {
    return (
      <Card>
        <EmployeeForm
          mode={editingEmp ? { kind: "edit", employee: editingEmp } : { kind: "create" }}
          linkableAccounts={linkableAccounts}
          onDone={() => {
            setCreating(false);
            setEditingEmp(null);
            router.refresh();
          }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {isOwner ? <PayrollPanel payrollDay={payrollDay} /> : null}

      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-muted">
          {items.length > 0 ? t("employees.count", { count: items.length }) : null}
        </p>
        {isOwner ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="bg-brand text-caption inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] px-3 font-medium text-white transition-colors hover:bg-brand-ember"
          >
            <Plus className="size-3.5" aria-hidden />
            {t("employees.add")}
          </button>
        ) : null}
      </div>

      {items.length === 0 ? (
        <Card>
          <p className="text-body text-muted">{t("employees.empty")}</p>
        </Card>
      ) : (
        items.map((emp) => (
          <Card key={emp.id} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-h2 text-ink">{emp.name}</span>
                <span className="text-label text-muted">
                  {emp.role ?? t("employees.roleUnset")}
                </span>
              </div>
              <div className="flex items-center gap-2">
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
                {isOwner ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setEditingEmp(emp)}
                      className="text-muted hover:text-ink transition-colors"
                      aria-label={t("employees.editTitle")}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(emp)}
                      disabled={deletingId === emp.id}
                      className="text-danger transition-colors disabled:opacity-40"
                      aria-label={t("employees.form.deleteConfirm", { name: emp.name })}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </>
                ) : null}
              </div>
            </div>

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

            {isOwner ? (
              <div className="border-border flex items-center justify-between gap-2 border-t pt-3">
                <span className="text-caption text-muted inline-flex items-center gap-1">
                  <Coins className="size-3.5" aria-hidden />
                  {t("employees.payroll.dailyRate")}
                </span>
                {emp.dailyPayCents !== null ? (
                  <span className="text-label font-semibold text-ink tabular-nums">
                    {formatLKR(emp.dailyPayCents)}
                  </span>
                ) : (
                  <span className="text-caption text-faint">{t("employees.payroll.notSet")}</span>
                )}
              </div>
            ) : null}
          </Card>
        ))
      )}

      {items.length > 0 && (
        <p className="text-caption text-faint px-1">{t("employees.scopeNote")}</p>
      )}
    </div>
  );
}
