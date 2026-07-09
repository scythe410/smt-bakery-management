"use client";

// Settings › User Accounts (SPEC §4.4) — read-only roster of the tenant's login
// accounts (profiles), gated by the owner/manager tenant-read RLS policy
// (migration 004). Shows each user's name, login role, and language preference,
// with the current user marked. Creating/inviting/removing users needs the
// Supabase Admin API (service role) and is out of scope for this baseline
// (flagged) — hence no mutations here. Names are business data, shown as entered.

import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { StatusPill, type Tone } from "@/components/ui/status-pill";
import { useAppContext } from "@/components/app/app-provider";
import type { UserAccount } from "@/lib/db/selectors/settings";
import type { AppRole } from "@/lib/access";

const ROLE_TONE: Record<AppRole, Tone> = {
  owner: "success",
  manager: "info",
  staff: "neutral",
};

export function UserAccounts({ users }: { users: UserAccount[] }) {
  const { t } = useTranslation();
  const { profile } = useAppContext();

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-ink">{t("settings.users.title")}</h2>
        <p className="text-body text-muted">{t("settings.users.description")}</p>
      </div>

      <ul className="flex flex-col divide-y divide-[color:var(--border)]">
        {users.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="text-label text-ink truncate">
                {u.name}
                {u.id === profile.id ? (
                  <span className="text-caption text-muted"> · {t("settings.users.you")}</span>
                ) : null}
              </span>
              <span className="text-caption text-muted">
                {t(`settings.language.${u.languagePref}`)}
              </span>
            </div>
            <StatusPill tone={ROLE_TONE[u.role]} label={t(`settings.role.${u.role}`)} />
          </li>
        ))}
      </ul>

      <p className="text-caption text-faint">{t("settings.users.manageNote")}</p>
    </Card>
  );
}
