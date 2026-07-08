"use client";

// Language switch (CLAUDE.md §3). Flips en ↔ si and persists the choice to
// profile.language_pref via the setLanguage server action. The action
// revalidates the layout, so the root layout re-resolves the language, swaps the
// Sinhala font, and the i18n instance follows — no full reload. The button shows
// the language you'd switch TO (its own endonym, rendered in the Sinhala face).

import { useTransition } from "react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/app/(app)/actions";
import { toLanguage } from "@/i18n/config";

export function LanguageToggle() {
  const { t, i18n } = useTranslation();
  const [pending, startTransition] = useTransition();

  const current = toLanguage(i18n.language);
  const next = current === "en" ? "si" : "en";
  const label = next === "en" ? t("shell.langEn") : t("shell.langSi");

  return (
    <button
      type="button"
      disabled={pending}
      aria-label={t("shell.changeLanguage")}
      onClick={() => startTransition(() => setLanguage(next))}
      className="text-ink hover:bg-surface-2 focus-visible:ring-brand/40 font-sinhala flex size-11 items-center justify-center rounded-[var(--radius)] text-label font-semibold outline-none transition-colors focus-visible:ring-2 disabled:opacity-50"
    >
      {label}
    </button>
  );
}
