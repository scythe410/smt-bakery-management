// Zod schemas for the Settings mutations (SPEC §4.4). All validated server-side
// (CLAUDE.md §7.6); unknown fields rejected via `.strict()`. business_id / id /
// role are NEVER accepted from the client — the actions target the caller's own
// tenant via RLS (owner-only business UPDATE policy). Money-adjacent values (the
// VAT rate) are integers in basis points; no floats are stored.

import { z } from "zod";
import { NOTIFICATION_KEYS, TIMEZONES } from "@/lib/settings/settings-config";
import { languages } from "@/i18n/config";

// Business profile: identity + operating defaults. locale_default is the TENANT
// default language (distinct from a user's own profile.language_pref).
export const businessProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    // Optional postal line shown on the printed bill. Blank clears it (→ null in
    // the action); no format is imposed — it's free text (e.g. "Walahanduwa, Galle").
    address: z.string().trim().max(200).optional(),
    timezone: z.enum(TIMEZONES as unknown as [string, ...string[]]),
    localeDefault: z.enum(languages as unknown as [string, ...string[]]),
  })
  .strict();

export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

// Tax config. VAT rate arrives as a percent (what the owner types) and is
// converted to integer basis points in the action. Registration id only kept
// when registered; the action clears it otherwise.
export const taxConfigSchema = z
  .object({
    // Percent, 0–100, at most 2 decimals of a percent (→ integer bps).
    vatRatePercent: z.coerce.number().min(0).max(100).finite(),
    registered: z.coerce.boolean(),
    taxId: z.string().trim().max(64).optional(),
  })
  .strict();

export type TaxConfigInput = z.infer<typeof taxConfigSchema>;

// Notification preferences: exactly the known keys, each a boolean. Built
// dynamically from NOTIFICATION_KEYS so adding a toggle needs only the config +
// an i18n label, never a schema edit here.
export const notificationPreferencesSchema = z
  .object(
    Object.fromEntries(NOTIFICATION_KEYS.map((k) => [k, z.coerce.boolean()])) as z.ZodRawShape,
  )
  .strict();

export type NotificationPreferencesInput = z.infer<typeof notificationPreferencesSchema>;

// Logo upload. The file itself is validated in the action (mime/size against the
// bucket allow-list); here we only bound what an image may be. SVG is excluded
// on purpose: it can carry embedded <script>, so an SVG logo served back is a
// stored-XSS vector — only raster formats are accepted (mirrors the bucket's
// allowed_mime_types; see migration 006).
export const LOGO_MAX_BYTES = 2 * 1024 * 1024; // matches the 'logos' bucket limit
export const LOGO_MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
