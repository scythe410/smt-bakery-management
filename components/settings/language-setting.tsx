"use client";

// Settings › Language (SPEC §5.2, CLAUDE.md §3). The canonical place to choose
// the interface language; the header toggle is the quick per-device shortcut,
// this is the labelled control. Both switch INSTANTLY client-side via
// i18n.changeLanguage (no reload, no server re-render), then persist to
// profile.language_pref in the background (fire-and-forget) for the next fresh
// load's first paint.
//
// Each option is shown by its OWN endonym (English / සිංහල), so it reads in its
// native script whatever the active UI language is — the standard language-picker
// convention. Endonyms live in i18n (identical in both locales) rather than being
// hardcoded, keeping to "no hardcoded UI strings".

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { setLanguage } from "@/app/(app)/actions";
import { Card } from "@/components/ui/card";
import { changeLanguage } from "@/i18n/client";
import { languages, toLanguage, type Language } from "@/i18n/config";

export function LanguageSetting() {
  const { t, i18n } = useTranslation();
  const current = toLanguage(i18n.language);

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-h2 text-ink">{t("settings.language.title")}</h2>
        <p className="text-body text-muted">{t("settings.language.description")}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={t("settings.language.title")}
        className="grid grid-cols-2 gap-2"
      >
        {languages.map((lang: Language) => {
          const active = current === lang;
          return (
            <button
              key={lang}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (active) return;
                // Loads the target locale's chunk on demand, then switches (HIGH-4).
                void changeLanguage(i18n, lang);
                void setLanguage(lang).catch(() => {});
              }}
              className={`focus-visible:ring-brand/40 flex min-h-11 items-center justify-between gap-2 rounded-[var(--radius)] border px-3 outline-none transition-colors focus-visible:ring-2 ${
                active
                  ? "border-brand bg-red-tint text-ink"
                  : "border-border text-muted hover:border-border-strong hover:text-ink"
              }`}
            >
              <span className={`text-label font-semibold ${lang === "si" ? "font-sinhala" : ""}`}>
                {t(`settings.language.${lang}`)}
              </span>
              {active ? <Check className="text-brand size-4 shrink-0" aria-hidden /> : null}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
