"use client";

// Settings › Notification Preferences (SPEC §4.4). One toggle per alert type,
// stored on business.notification_preferences (jsonb). These preferences gate
// which notifications the business wants surfaced (the bell/badge already exists,
// this baseline records intent) — flagged pending client confirmation of the
// exact alert catalogue. Posts to the owner-only updateNotificationPreferences
// action; unchecked boxes are absent from FormData and saved as false.

import { useActionState } from "react";
import { useTranslation } from "react-i18next";
import {
  updateNotificationPreferences,
  type SettingsActionState,
} from "@/app/(app)/settings/actions";
import { Card } from "@/components/ui/card";
import {
  NOTIFICATION_KEYS,
  type NotificationPreferences,
} from "@/lib/settings/settings-config";

export function NotificationPreferencesForm({
  preferences,
}: {
  preferences: NotificationPreferences;
}) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<SettingsActionState, FormData>(
    updateNotificationPreferences,
    {},
  );

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-ink">{t("settings.notifications.title")}</h2>
        <p className="text-body text-muted">{t("settings.notifications.description")}</p>
      </div>

      <form action={action} className="flex flex-col gap-3">
        <div className="flex flex-col divide-y divide-[color:var(--border)]">
          {NOTIFICATION_KEYS.map((key) => (
            <label key={key} className="flex items-center justify-between gap-3 py-2">
              <span className="flex flex-col">
                <span className="text-label text-ink">{t(`settings.notifications.${key}`)}</span>
                <span className="text-caption text-muted">
                  {t(`settings.notifications.${key}Hint`)}
                </span>
              </span>
              <input
                type="checkbox"
                name={key}
                defaultChecked={preferences[key]}
                className="accent-brand size-4 shrink-0"
              />
            </label>
          ))}
        </div>

        {state.ok ? (
          <p className="text-caption text-success">{t("settings.notifications.saved")}</p>
        ) : null}
        {state.error ? (
          <p role="alert" className="text-caption text-danger">
            {t(state.error)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {pending ? t("settings.notifications.saving") : t("settings.notifications.save")}
        </button>
      </form>
    </Card>
  );
}
