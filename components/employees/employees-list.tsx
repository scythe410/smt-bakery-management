"use client";

// Employees screen (SPEC §4.3), restructured after client feedback ("UX is
// bad" with a 13-person roster): the payroll approve/pay flow and the team
// roster are separate TABS (URL-driven, like Finance), and the roster renders
// as compact list-rows (DESIGN.md §4 tables→mobile) instead of tall cards.
// Empty permissions/shift render NOTHING — with a mostly-cashier roster those
// "No permissions set / No shift set" blocks were pure noise. Payroll is
// owner-only, so non-owners get the roster alone, no tab bar.

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, Trash2, UserCheck } from "lucide-react";
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

const TABS = [
  { key: "payroll", labelKey: "employees.tabs.payroll" },
  { key: "team", labelKey: "employees.tabs.team" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function EmployeesTabs({ active }: { active: TabKey }) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Links carry the other params along (payDate survives a tab switch).
  function hrefFor(tab: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div role="tablist" className="border-border flex gap-1 border-b">
      {TABS.map((tab) => {
        const isActive = active === tab.key;
        return (
          <Link
            key={tab.key}
            href={hrefFor(tab.key)}
            role="tab"
            aria-selected={isActive}
            className={`text-label flex min-h-11 items-center border-b-2 px-3 font-medium transition-colors ${
              isActive ? "border-brand text-brand" : "text-muted hover:text-ink border-transparent"
            }`}
          >
            {t(tab.labelKey)}
          </Link>
        );
      })}
    </div>
  );
}

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
  const searchParams = useSearchParams();
  const isOwner = profile.role === "owner";

  // Owner defaults to Payroll (the daily task); non-owners have no payroll tab.
  const rawTab = searchParams.get("tab");
  const tab: TabKey = !isOwner ? "team" : rawTab === "team" ? "team" : "payroll";

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
      {isOwner ? <EmployeesTabs active={tab} /> : null}

      {tab === "payroll" && isOwner ? (
        <PayrollPanel payrollDay={payrollDay} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-label text-muted">
              {items.length > 0 ? t("employees.count", { count: items.length }) : null}
            </p>
            {isOwner ? (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="bg-brand text-caption hover:bg-brand-ember inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] px-3 font-medium text-white transition-colors"
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
            <Card className="flex flex-col">
              <ul className="flex flex-col">
                {items.map((emp) => (
                  <li
                    key={emp.id}
                    className={`border-border flex flex-col gap-1.5 border-b py-3 first:pt-0 last:border-0 last:pb-0 ${
                      deletingId === emp.id ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-label text-ink truncate font-semibold">
                          {emp.name}
                        </span>
                        <span className="text-caption text-muted truncate">
                          {emp.role ?? t("employees.roleUnset")}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        {isOwner ? (
                          emp.dailyPayCents !== null ? (
                            <span className="text-label text-ink font-semibold tabular-nums">
                              {formatLKR(emp.dailyPayCents)}
                            </span>
                          ) : (
                            <span className="text-caption text-faint">
                              {t("employees.payroll.notSet")}
                            </span>
                          )
                        ) : null}
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

                    {/* Permissions / shift chips — only when actually set. */}
                    {emp.permissions.length > 0 || emp.shift.length > 0 ? (
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
                        {emp.shift.map(({ day, hours }) => (
                          <span
                            key={day}
                            className="bg-surface-2 border-border text-caption text-ink inline-flex items-center gap-1.5 rounded-[var(--radius)] border px-2 py-0.5"
                          >
                            <span className="text-muted font-medium uppercase">
                              {t(`employees.weekday.${day}`)}
                            </span>
                            <span className="tabular-nums">{hours}</span>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {items.length > 0 && (
            <p className="text-caption text-faint px-1">{t("employees.scopeNote")}</p>
          )}
        </>
      )}
    </div>
  );
}
