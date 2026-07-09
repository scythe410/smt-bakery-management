// selectors/settings.ts — the Settings screen's derived, render-ready view
// (SPEC §4.4). Pulls the tenant's business row + user accounts and normalises
// the jsonb config (tax_config, notification_preferences) into typed shapes,
// plus a signed URL for the (private) logo object. No formatting here.

import "server-only";
import { cache } from "react";
import { getBusiness } from "@/lib/auth";
import { listTenantProfiles, signLogoUrl } from "@/lib/db/queries/settings";
import {
  parseNotificationPreferences,
  parseTaxConfig,
  type NotificationPreferences,
  type TaxConfig,
} from "@/lib/settings/settings-config";
import type { AppRole } from "@/lib/access";
import type { Language } from "@/i18n/config";

export type UserAccount = {
  id: string;
  name: string;
  role: AppRole;
  languagePref: Language;
};

export type SettingsView = {
  business: {
    name: string;
    currency: string;
    timezone: string;
    localeDefault: Language;
    /** Object PATH stored on business.logo_url (private bucket), or null. */
    logoPath: string | null;
    /** Short-lived signed URL for the logo, or null → monogram fallback. */
    logoUrl: string | null;
  };
  tax: TaxConfig;
  notifications: NotificationPreferences;
  users: UserAccount[];
};

async function loadSettings(): Promise<SettingsView> {
  const business = await getBusiness();
  if (!business) {
    // Settings is owner-gated and every owner has a tenant; this is defensive.
    throw new Error("settings: no business for the current session");
  }

  const [profiles, logoUrl] = await Promise.all([
    listTenantProfiles(),
    signLogoUrl(business.logo_url),
  ]);

  return {
    business: {
      name: business.name,
      currency: business.currency,
      timezone: business.timezone,
      localeDefault: business.locale_default as Language,
      logoPath: business.logo_url,
      logoUrl,
    },
    tax: parseTaxConfig(business.tax_config),
    notifications: parseNotificationPreferences(business.notification_preferences),
    users: profiles.map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      languagePref: p.language_pref as Language,
    })),
  };
}

/** The Settings view for this tenant. React-`cache()`d per request. */
export const getSettings = cache((): Promise<SettingsView> => loadSettings());
