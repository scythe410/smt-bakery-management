"use client";

// Settings › Business Profile (SPEC §4.4). Two mutations in one card:
//   1. Logo upload → Storage (private 'logos' bucket, per-tenant path); the
//      business row stores the object PATH and reads are served via signed URL.
//   2. Name / timezone / tenant default language → business row.
// Both post to owner-only server actions that set nothing client-supplied for
// identity (CLAUDE.md §7). The default language here is the TENANT default
// (business.locale_default) — distinct from a user's own language_pref, which
// the Language card below sets per user.

import { useActionState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  updateBusinessProfile,
  uploadLogo,
  type SettingsActionState,
} from "@/app/(app)/settings/actions";
import { Card } from "@/components/ui/card";
import { Logo } from "@/components/ui/logo";
import { TIMEZONES } from "@/lib/settings/settings-config";
import { languages, type Language } from "@/i18n/config";

const FIELD_CLASS =
  "border-border text-label text-ink focus-visible:ring-brand/40 h-10 rounded-[var(--radius)] border bg-surface px-2 outline-none focus-visible:ring-2";

export function BusinessProfileForm({
  name,
  timezone,
  localeDefault,
  logoUrl,
}: {
  name: string;
  timezone: string;
  localeDefault: Language;
  logoUrl: string | null;
}) {
  const { t } = useTranslation();

  const [logoState, logoAction, logoPending] = useActionState<SettingsActionState, FormData>(
    uploadLogo,
    {},
  );
  const [profileState, profileAction, profilePending] = useActionState<
    SettingsActionState,
    FormData
  >(updateBusinessProfile, {});

  const logoFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    // Clear the file input after a successful upload (DOM side-effect only).
    if (logoState.ok) logoFormRef.current?.reset();
  }, [logoState.ok]);

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-h2 text-ink">{t("settings.business.title")}</h2>

      {/* Logo — preview + upload. */}
      <form ref={logoFormRef} action={logoAction} className="flex items-center gap-3">
        <Logo src={logoUrl} name={name} size="md" />
        <div className="flex flex-1 flex-col gap-1.5">
          <span className="text-caption text-muted">{t("settings.business.logo")}</span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              name="logo"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="text-caption text-muted file:border-border-strong file:text-ink file:mr-2 file:rounded-[var(--radius)] file:border file:bg-surface file:px-2 file:py-1 file:text-label"
            />
            <button
              type="submit"
              disabled={logoPending}
              className="bg-brand text-brand-white text-label hover:bg-brand-ember h-9 rounded-[var(--radius)] px-3 font-semibold transition-colors disabled:opacity-50"
            >
              {logoPending ? t("settings.business.uploading") : t("settings.business.upload")}
            </button>
          </div>
          <span className="text-caption text-faint">{t("settings.business.logoHint")}</span>
          {logoState.ok ? (
            <span className="text-caption text-success">{t("settings.business.logoSaved")}</span>
          ) : null}
          {logoState.error ? (
            <span role="alert" className="text-caption text-danger">
              {t(logoState.error)}
            </span>
          ) : null}
        </div>
      </form>

      <hr className="border-border" />

      {/* Name / timezone / default language. */}
      <form action={profileAction} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-caption text-muted">{t("settings.business.name")}</span>
          <input
            type="text"
            name="name"
            required
            maxLength={120}
            defaultValue={name}
            className={FIELD_CLASS}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">{t("settings.business.timezone")}</span>
            <select name="timezone" defaultValue={timezone} className={FIELD_CLASS}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-caption text-muted">
              {t("settings.business.defaultLanguage")}
            </span>
            <select name="localeDefault" defaultValue={localeDefault} className={FIELD_CLASS}>
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {t(`settings.language.${lang}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {profileState.ok ? (
          <p className="text-caption text-success">{t("settings.business.saved")}</p>
        ) : null}
        {profileState.error ? (
          <p role="alert" className="text-caption text-danger">
            {t(profileState.error)}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={profilePending}
          className="bg-brand text-brand-white text-label hover:bg-brand-ember h-10 rounded-[var(--radius)] font-semibold transition-colors disabled:opacity-50"
        >
          {profilePending ? t("settings.business.saving") : t("settings.business.save")}
        </button>
      </form>
    </Card>
  );
}
