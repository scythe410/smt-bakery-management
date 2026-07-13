"use client";

// Client-side i18n provider. Wraps the tree once (in the root layout) with a
// react-i18next instance so any Client Component can call `useTranslation`.
//
// The active language is passed in from the server (root layout →
// getCurrentLanguage) for first paint, so the client renders the same language
// the server did — no flash, no hydration mismatch. AFTER that, switching is
// client-only: the header toggle / Settings call `i18n.changeLanguage` directly
// (no navigation, no server re-render), and the `languageChanged` listener below
// keeps <html lang> + the Sinhala body font in step. The persisted preference
// only drives the NEXT server render (first paint on a later load).

import { createInstance, type i18n as I18nInstance } from "i18next";
import { useEffect, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { defaultLanguage, namespace, toLanguage, type Language } from "@/i18n/config";
import en from "@/i18n/locales/en.json";
import si from "@/i18n/locales/si.json";

const resources = {
  en: { [namespace]: en },
  si: { [namespace]: si },
} as const;

function createI18n(language: Language): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: defaultLanguage,
    defaultNS: namespace,
    ns: [namespace],
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

export function I18nProvider({
  language,
  children,
}: {
  language: string;
  children: React.ReactNode;
}) {
  const lng = toLanguage(language);
  // Create exactly one instance for the lifetime of the provider (lazy init).
  const [instance] = useState<I18nInstance>(() => createI18n(lng));

  // Sync <html lang> + the Sinhala body font to the ACTIVE language on every
  // change — crucially including client-side switches (header toggle / Settings),
  // which don't re-render the server layout. SSR sets both correctly for first
  // paint; this keeps them in step for interaction, with no server round trip.
  useEffect(() => {
    const sync = (next: string) => {
      const active = toLanguage(next);
      document.documentElement.lang = active;
      document.body.classList.toggle("font-sinhala", active === "si");
    };
    instance.on("languageChanged", sync);
    return () => {
      instance.off("languageChanged", sync);
    };
  }, [instance]);

  // If the server ever re-renders with a different language prop (e.g. first
  // paint after a fresh load with a persisted preference), follow it. The
  // changeLanguage fires 'languageChanged', so the effect above syncs the chrome.
  useEffect(() => {
    if (instance.language !== lng) {
      void instance.changeLanguage(lng);
    }
  }, [instance, lng]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
