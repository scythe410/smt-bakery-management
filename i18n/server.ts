// Server-side translation for React Server Components.
//
// react-i18next's hooks are client-only, so server components can't use them.
// Instead we spin up a throwaway i18next instance per call (cheap: resources are
// already in memory) and hand back a fixed `t`. Pair the returned `t` with a
// language resolved server-side (e.g. profile.language_pref via
// lib/auth.getCurrentLanguage) so server and client render the same strings.

import { createInstance } from "i18next";
import { defaultLanguage, namespace, toLanguage } from "@/i18n/config";
import en from "@/i18n/locales/en.json";
import si from "@/i18n/locales/si.json";

const resources = {
  en: { [namespace]: en },
  si: { [namespace]: si },
} as const;

export async function getT(language?: string) {
  const lng = toLanguage(language);
  const instance = createInstance();
  await instance.init({
    lng,
    fallbackLng: defaultLanguage,
    defaultNS: namespace,
    ns: [namespace],
    resources,
    interpolation: { escapeValue: false }, // React already escapes.
  });
  return { t: instance.getFixedT(lng, namespace), i18n: instance };
}
