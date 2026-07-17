"use client";

import { useActionState, useState } from "react";
import { useTranslation } from "react-i18next";
import { createEmployee, editEmployee, type EmpFormState } from "@/app/(app)/employees/actions";
import { WEEKDAYS } from "@/lib/employees/employee-config";
import type { EmployeeListItem } from "@/lib/db/selectors/employees";
import type { LinkableAccount } from "@/lib/db/queries/employees";

const FIELD =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

const PERM_KEYS = ["orders", "inventory", "menu", "bookings", "reports", "finance", "settings"] as const;

const ACCESS_ROLES = ["owner", "manager", "staff"] as const;

type Props = {
  mode: { kind: "create" } | { kind: "edit"; employee: EmployeeListItem };
  linkableAccounts: LinkableAccount[];
  onDone: () => void;
};

function initialPerms(emp?: EmployeeListItem): { all: boolean; keys: Set<string> } {
  if (!emp) return { all: false, keys: new Set() };
  if (emp.permissions.includes("all")) return { all: true, keys: new Set() };
  return { all: false, keys: new Set(emp.permissions) };
}

function initialShift(emp?: EmployeeListItem): Record<string, string> {
  if (!emp) return {};
  return Object.fromEntries(emp.shift.map(({ day, hours }) => [day, hours]));
}

export function EmployeeForm({ mode, linkableAccounts, onDone }: Props) {
  const { t } = useTranslation();
  const emp = mode.kind === "edit" ? mode.employee : undefined;

  // Accounts offerable in this form: those not yet linked, plus the one already
  // linked to the employee being edited (so it stays selected).
  const availableAccounts = linkableAccounts.filter(
    (a) => a.linkedEmployeeId === null || (emp != null && a.linkedEmployeeId === emp.id),
  );

  const [selectedProfileId, setSelectedProfileId] = useState<string>(emp?.profileId ?? "");
  const selectedAccount = availableAccounts.find((a) => a.id === selectedProfileId);
  const isOwnerAccount = selectedAccount?.role === "owner";
  const [accessRole, setAccessRole] = useState<string>(selectedAccount?.role ?? "staff");

  const boundAction =
    mode.kind === "edit"
      ? editEmployee.bind(null, mode.employee.id)
      : createEmployee;

  const [state, formAction, pending] = useActionState<EmpFormState, FormData>(
    boundAction,
    {},
  );

  const initPerms = initialPerms(emp);
  const [allChecked, setAllChecked] = useState(initPerms.all);
  const [checkedPerms, setCheckedPerms] = useState<Set<string>>(initPerms.keys);
  const initShift = initialShift(emp);
  const [shiftDays, setShiftDays] = useState<Set<string>>(new Set(Object.keys(initShift)));
  const [shiftHours, setShiftHours] = useState<Record<string, string>>(initShift);

  if (state.ok) {
    onDone();
  }

  function togglePerm(key: string) {
    setCheckedPerms((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleDay(day: string) {
    setShiftDays((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else {
        next.add(day);
        setShiftHours((h) => ({ ...h, [day]: h[day] ?? "09:00-17:00" }));
      }
      return next;
    });
  }

  function onSelectAccount(id: string) {
    setSelectedProfileId(id);
    const acct = availableAccounts.find((a) => a.id === id);
    // Default the access level to the account's current role on selection.
    if (acct) setAccessRole(acct.role);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-h2 text-ink">
        {mode.kind === "create" ? t("employees.addTitle") : t("employees.editTitle")}
      </h2>

      <form action={formAction} className="flex flex-col gap-4">
        {/* Name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label text-ink font-medium" htmlFor="emp-name">
            {t("employees.form.name")}
          </label>
          <input
            id="emp-name"
            name="name"
            type="text"
            required
            defaultValue={emp?.name ?? ""}
            placeholder={t("employees.form.namePlaceholder")}
            className={FIELD}
          />
        </div>

        {/* Job title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label text-ink font-medium" htmlFor="emp-role">
            {t("employees.form.jobTitle")}
          </label>
          <input
            id="emp-role"
            name="role"
            type="text"
            defaultValue={emp?.role ?? ""}
            placeholder={t("employees.form.jobTitlePlaceholder")}
            className={FIELD}
          />
        </div>

        {/* Daily pay rate */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label text-ink font-medium" htmlFor="emp-daily-pay">
            {t("employees.form.dailyPay")}
          </label>
          <input
            id="emp-daily-pay"
            name="daily_pay_lkr"
            type="number"
            min="0"
            step="1"
            defaultValue={emp?.dailyPayCents != null ? emp.dailyPayCents / 100 : ""}
            placeholder={t("employees.form.dailyPayPlaceholder")}
            className={FIELD}
            onFocus={(e) => e.target.select()}
          />
        </div>

        {/* Login account */}
        <div className="flex flex-col gap-1.5">
          <label className="text-label text-ink font-medium" htmlFor="emp-profile">
            {t("employees.form.loginAccount")}
          </label>
          <select
            id="emp-profile"
            name="profile_id"
            value={selectedProfileId}
            onChange={(e) => onSelectAccount(e.target.value)}
            className={`${FIELD} w-full`}
          >
            <option value="">{t("employees.form.loginAccountNone")}</option>
            {availableAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.email} ({t(`employees.accessRole.${a.role}`)})
              </option>
            ))}
          </select>
        </div>

        {/* Access level (only when linked to an account) */}
        {selectedProfileId !== "" && (
          <div className="flex flex-col gap-1.5">
            <label className="text-label text-ink font-medium" htmlFor="emp-access-role">
              {t("employees.form.accessLevel")}
            </label>
            {isOwnerAccount ? (
              <>
                <select
                  id="emp-access-role"
                  disabled
                  value="owner"
                  className={`${FIELD} w-full opacity-60`}
                >
                  <option value="owner">{t("employees.accessRole.owner")}</option>
                </select>
                <input type="hidden" name="access_role" value="owner" />
              </>
            ) : (
              <select
                id="emp-access-role"
                name="access_role"
                value={accessRole}
                onChange={(e) => setAccessRole(e.target.value)}
                className={`${FIELD} w-full`}
              >
                {ACCESS_ROLES.filter((r) => r !== "owner").map((r) => (
                  <option key={r} value={r}>
                    {t(`employees.accessRole.${r}`)}
                  </option>
                ))}
              </select>
            )}
            <p className="text-caption text-faint">{t("employees.form.accessLevelHint")}</p>
          </div>
        )}

        {/* Permissions */}
        <div className="flex flex-col gap-2">
          <span className="text-label text-ink font-medium">{t("employees.form.permissionsLabel")}</span>
          <label className="flex items-center gap-2 text-label text-ink">
            <input
              type="checkbox"
              name="perm_all"
              value="on"
              checked={allChecked}
              onChange={(e) => setAllChecked(e.target.checked)}
              className="accent-brand-red"
            />
            {t("employees.permission.all")}
          </label>
          <div className="flex flex-wrap gap-x-4 gap-y-2 pl-1">
            {PERM_KEYS.map((key) => (
              <label
                key={key}
                className={`flex items-center gap-2 text-label ${allChecked ? "text-faint" : "text-ink"}`}
              >
                <input
                  type="checkbox"
                  name={`perm_${key}`}
                  value="on"
                  disabled={allChecked}
                  checked={allChecked || checkedPerms.has(key)}
                  onChange={() => togglePerm(key)}
                  className="accent-brand-red"
                />
                {t(`employees.permission.${key}`)}
              </label>
            ))}
          </div>
        </div>

        {/* Shift schedule */}
        <div className="flex flex-col gap-2">
          <span className="text-label text-ink font-medium">{t("employees.form.shiftLabel")}</span>
          <div className="flex flex-col gap-2">
            {WEEKDAYS.map((day) => (
              <div key={day} className="flex items-center gap-3">
                <label className="flex w-12 shrink-0 items-center gap-2 text-label text-ink">
                  <input
                    type="checkbox"
                    name={`shift_${day}`}
                    value="on"
                    checked={shiftDays.has(day)}
                    onChange={() => toggleDay(day)}
                    className="accent-brand-red"
                  />
                  {t(`employees.weekday.${day}`)}
                </label>
                {shiftDays.has(day) && (
                  <input
                    type="text"
                    name={`shift_${day}_hours`}
                    value={shiftHours[day] ?? "09:00-17:00"}
                    onChange={(e) =>
                      setShiftHours((h) => ({ ...h, [day]: e.target.value }))
                    }
                    placeholder={t("employees.form.shiftHoursPlaceholder")}
                    className={`${FIELD} flex-1`}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {state.error && (
          <p className="text-label text-danger">{t(state.error)}</p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="border-border-strong text-label text-ink flex h-11 flex-1 items-center justify-center rounded-[var(--radius)] border bg-surface font-medium transition-colors disabled:opacity-40"
          >
            {t("employees.form.cancel")}
          </button>
          <button
            type="submit"
            disabled={pending}
            className="bg-brand text-label flex h-11 flex-1 items-center justify-center rounded-[var(--radius)] font-medium text-white transition-colors hover:bg-brand-ember disabled:opacity-40"
          >
            {pending ? t("employees.form.saving") : t("employees.form.save")}
          </button>
        </div>
      </form>
    </div>
  );
}
