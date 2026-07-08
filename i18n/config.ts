// i18n config — the single source of truth for supported languages and the
// namespace. Shared by the server helper (i18n/server.ts) and the client
// provider (i18n/client.tsx) so both stay in lockstep. CLAUDE.md §3 (i18n).

export const languages = ["en", "si"] as const;
export type Language = (typeof languages)[number];

// Business default (CLAUDE.md §4: business.locale_default = 'en'). Also the
// fallback when a key is missing in the active language.
export const defaultLanguage: Language = "en";

// One namespace for now ("common"). Split later if the bundle grows.
export const namespace = "common";

/** Narrow an arbitrary string to a supported Language, else the default. */
export function toLanguage(value: string | null | undefined): Language {
  return languages.includes(value as Language) ? (value as Language) : defaultLanguage;
}
