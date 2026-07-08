"use client";

// Client-side i18n provider. Wraps the tree once (in the root layout) with a
// react-i18next instance so any Client Component can call `useTranslation`.
//
// The active language is passed in from the server (root layout →
// getCurrentLanguage), so the client renders the same language the server did —
// no flash, no hydration mismatch. When the prop changes (e.g. after a language
// switch lands), we call changeLanguage on the existing instance.

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

  useEffect(() => {
    if (instance.language !== lng) {
      void instance.changeLanguage(lng);
    }
  }, [instance, lng]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
