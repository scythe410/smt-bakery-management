"use client";

// Language switch (CLAUDE.md §3). Flips en ↔ si INSTANTLY, client-side: it calls
// i18n.changeLanguage so every string re-renders at once (no navigation, no
// server re-render, no selector refetch), then persists the choice to
// profile.language_pref in the background (fire-and-forget — the UI has already
// switched; a failed write is ignored and just means the next fresh load starts
// in the old language). The button shows the language you'd switch TO (its own
// endonym, rendered in the Sinhala face).

import { useTranslation } from "react-i18next";
import { setLanguage } from "@/app/(app)/actions";
import { toLanguage } from "@/i18n/config";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();

  const current = toLanguage(i18n.language);
  const next = current === "en" ? "si" : "en";
  const label = next === "en" ? t("shell.langEn") : t("shell.langSi");

  return (
    <button
      type="button"
      aria-label={t("shell.changeLanguage")}
      onClick={() => {
        void i18n.changeLanguage(next);
        void setLanguage(next).catch(() => {});
      }}
      className="text-ink hover:bg-surface-2 focus-visible:ring-brand/40 font-sinhala flex size-11 items-center justify-center rounded-[var(--radius)] text-label font-semibold outline-none transition-colors focus-visible:ring-2"
    >
      {label}
    </button>
  );
}
