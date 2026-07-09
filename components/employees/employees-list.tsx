"use client";

// Employees directory (SPEC §4.3) — read-focused. Renders the tenant's staff as
// stacked cards (DESIGN.md §4 tables→mobile): name (bold), job title, the
// permission set as chips, and the weekly shift schedule. A "Login" pill marks
// employees linked to an app account. This screen is a directory view only —
// payroll and attendance are out of scope pending client confirmation (surfaced
// as a note), and there is no create/edit here yet (baseline pending confirmation).
//
// Client component so labels re-translate instantly on the language toggle.
// Employee names and job titles are business data, shown as entered — not
// translated (CLAUDE.md §3). Permission keys are config values, so they DO go
// through i18n (employees.permission.*), falling back to the raw key defensively.

import { useTranslation } from "react-i18next";
import { CalendarClock, ShieldCheck, UserCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { StatusPill } from "@/components/ui/status-pill";
import type { EmployeeListItem } from "@/lib/db/selectors/employees";

// Permission keys we know how to label (they mirror app sections + the "all"
// sentinel). i18n keys exist for these; anything else falls back to its raw key.
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

export function EmployeesList({ items }: { items: EmployeeListItem[] }) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <Card>
        <p className="text-body text-muted">{t("employees.empty")}</p>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label text-muted">
          {t("employees.count", { count: items.length })}
        </p>
      </div>

      {items.map((emp) => (
        <Card key={emp.id} className="flex flex-col gap-3">
          {/* Identity: name + job title, with a login-account marker. */}
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
                    label={KNOWN_PERMISSIONS.has(perm) ? t(`employees.permission.${perm}`) : perm}
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
        </Card>
      ))}

      {/* Scope note — payroll/attendance not built pending confirmation. */}
      <p className="text-caption text-faint px-1">{t("employees.scopeNote")}</p>
    </div>
  );
}
