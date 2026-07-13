"use client";

// Client-side i18n provider. Wraps the tree once (in the root layout) with a
// react-i18next instance so any Client Component can call `useTranslation`.
//
// Bundle discipline (Antigravity HIGH-4): neither en.json (16 KB) nor si.json
// (28 KB) is imported statically here — that would ship BOTH on every page. The
// ACTIVE language's bundle is delivered by the server as the `resources` prop
// (see i18n/server.getLocaleBundle → root layout), so first paint is flash-free
// with no JSON in the client JS at all. The OTHER language is code-split into its
// own chunk and fetched on demand only when the user switches to it (PF3 client
// switch) via `changeLanguage` below.
//
// The active language is passed in from the server for first paint, so the client
// renders the same language the server did — no flash, no hydration mismatch.
// AFTER that, switching is client-only: the header toggle / Settings call
// `changeLanguage` (no navigation, no server re-render), and the `languageChanged`
// listener keeps <html lang> + the Sinhala body font in step. The persisted
// preference only drives the NEXT server render (first paint on a later load).

import { createInstance, type i18n as I18nInstance } from "i18next";
import { useEffect, useState } from "react";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { defaultLanguage, namespace, toLanguage, type Language } from "@/i18n/config";

type Bundle = Record<string, unknown>;

function createI18n(language: Language, bundle: Bundle): I18nInstance {
  const instance = createInstance();
  instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: defaultLanguage,
    defaultNS: namespace,
    ns: [namespace],
    // Only the active language's bundle — the other is added on demand (below).
    // en/si are at full key parity, so the missing-key fallback to `en` never
    // needs a bundle that isn't loaded.
    resources: { [language]: { [namespace]: bundle } },
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

// On-demand locale loader: each language's JSON is a separate dynamic-import
// chunk, so switching pulls exactly the target bundle and nothing more.
async function loadLocale(language: Language): Promise<Bundle> {
  const mod =
    language === "si"
      ? await import("@/i18n/locales/si.json")
      : await import("@/i18n/locales/en.json");
  return mod.default as Bundle;
}

/**
 * Switch the interface language, loading the target bundle on demand if this
 * instance doesn't already have it. Use this instead of `i18n.changeLanguage`
 * directly (the toggle / Settings) so a switch never renders raw keys.
 */
export async function changeLanguage(instance: I18nInstance, language: string): Promise<void> {
  const target = toLanguage(language);
  if (!instance.hasResourceBundle(target, namespace)) {
    instance.addResourceBundle(target, namespace, await loadLocale(target));
  }
  await instance.changeLanguage(target);
}

export function I18nProvider({
  language,
  resources,
  children,
}: {
  language: string;
  /** The active language's bundle, delivered by the server (no client JSON). */
  resources: Bundle;
  children: React.ReactNode;
}) {
  const lng = toLanguage(language);
  // Create exactly one instance for the lifetime of the provider (lazy init).
  const [instance] = useState<I18nInstance>(() => createI18n(lng, resources));

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
  // matching bundle arrives in the same `resources` prop, so register it before
  // switching — no fetch, no flash. (On initial mount this is a no-op: the
  // instance was created with exactly this language.)
  useEffect(() => {
    if (instance.language === lng) return;
    if (!instance.hasResourceBundle(lng, namespace)) {
      instance.addResourceBundle(lng, namespace, resources);
    }
    void instance.changeLanguage(lng);
  }, [instance, lng, resources]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
