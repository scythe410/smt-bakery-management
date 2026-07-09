// settings-config.ts — client-safe shared config for the Settings screen
// (SPEC §4.4). Pure config + parsers, no DB/server imports, so the page, the
// forms, and the Zod schemas share ONE source of truth for the shapes stored in
// the business row's jsonb columns (tax_config, notification_preferences).

/**
 * Notification toggles surfaced in Settings. Keys are stored on
 * business.notification_preferences (jsonb). Extend here + add an i18n label
 * (settings.notifications.<key>) rather than hardcoding a toggle in the UI.
 */
export const NOTIFICATION_KEYS = [
  "low_stock",
  "new_orders",
  "new_bookings",
  "daily_summary",
] as const;
export type NotificationKey = (typeof NOTIFICATION_KEYS)[number];

export type NotificationPreferences = Record<NotificationKey, boolean>;

/** Defaults mirror the DB column default (operational alerts on, digest off). */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  low_stock: true,
  new_orders: true,
  new_bookings: true,
  daily_summary: false,
};

/** Normalise the notification_preferences jsonb into a fully-populated map. */
export function parseNotificationPreferences(value: unknown): NotificationPreferences {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const out = { ...DEFAULT_NOTIFICATION_PREFERENCES };
  for (const key of NOTIFICATION_KEYS) {
    if (typeof record[key] === "boolean") out[key] = record[key] as boolean;
  }
  return out;
}

/** Tax configuration, as read from / written to business.tax_config (jsonb). */
export type TaxConfig = {
  /** VAT rate in basis points (1 bp = 0.01%), so 8% = 800. Integer. */
  vatRateBps: number;
  /** Whether the business is VAT/tax registered. */
  registered: boolean;
  /** Tax registration number (free text), or "" when unset. */
  taxId: string;
};

export const DEFAULT_TAX_CONFIG: TaxConfig = {
  vatRateBps: 0,
  registered: false,
  taxId: "",
};

/** Normalise the tax_config jsonb into a typed TaxConfig (defensive on types). */
export function parseTaxConfig(value: unknown): TaxConfig {
  const record =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const vat = Number(record.vat_rate_bps);
  const taxId = record.tax_id;
  return {
    vatRateBps: Number.isFinite(vat) && vat >= 0 ? Math.round(vat) : 0,
    registered: record.registered === true,
    taxId: typeof taxId === "string" ? taxId : "",
  };
}

/**
 * A small, curated timezone list for the business-profile picker. Asia/Colombo
 * is the seed/default; the others cover common Sri-Lankan-adjacent operating
 * zones. Period math (lib/db/period.ts) resolves whatever IANA zone is stored,
 * so this list only bounds the UI, not what the DB can hold.
 */
export const TIMEZONES = [
  "Asia/Colombo",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "UTC",
] as const;
export type Timezone = (typeof TIMEZONES)[number];

/** Basis points → a percent string for display (800 → "8", 850 → "8.5"). */
export function bpsToPercentString(bps: number): string {
  return (bps / 100).toString();
}
