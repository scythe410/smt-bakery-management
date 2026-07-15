"use server";

// Settings server actions. Owner-only. VAT rate stored as integer basis points.

import { revalidatePath } from "next/cache";
import { getBusiness, requireRole, rolesFor } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidateBusinessTags } from "@/lib/db/cache";
import {
  businessProfileSchema,
  taxConfigSchema,
  notificationPreferencesSchema,
  LOGO_MAX_BYTES,
  LOGO_MIME_EXT,
} from "@/lib/zod/settings";
import { NOTIFICATION_KEYS } from "@/lib/settings/settings-config";
import type { Database, Json } from "@/lib/supabase/types";

export type SettingsActionState = { ok?: boolean; error?: string };

/**
 * Refresh the Settings screen and the shell layout (business name/logo live
 * there), and invalidate the cached business row so the new name/logo/timezone/
 * tax config is served everywhere (a timezone change also reshapes every period,
 * which the `business` tag flows through — see lib/db/cache.ts).
 */
function revalidateSettings(businessId: string) {
  revalidatePath("/settings");
  revalidatePath("/", "layout");
  revalidateBusinessTags(businessId, ["business"]);
}

// --- Business profile: name, timezone, tenant default language ---------------
export async function updateBusinessProfile(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await requireRole(rolesFor("settings"));
  if (!profile.business_id) return { error: "settings.business.error" };

  const parsed = businessProfileSchema.safeParse({
    name: formData.get("name"),
    address: formData.get("address") ?? undefined,
    timezone: formData.get("timezone"),
    localeDefault: formData.get("localeDefault"),
  });
  if (!parsed.success) return { error: "settings.business.error" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business")
    .update({
      name: parsed.data.name,
      // Empty → null so a cleared field removes the address line from the bill.
      address: parsed.data.address ? parsed.data.address : null,
      timezone: parsed.data.timezone,
      locale_default: parsed.data
        .localeDefault as Database["public"]["Enums"]["app_language"],
    })
    .eq("id", profile.business_id);
  if (error) return { error: "settings.business.error" };

  revalidateSettings(profile.business_id);
  return { ok: true };
}

// --- Logo upload (Storage) ---------------------------------------------------
export async function uploadLogo(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await requireRole(rolesFor("settings"));
  if (!profile.business_id) return { error: "settings.logo.error" };

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { error: "settings.logo.errorEmpty" };
  if (file.size > LOGO_MAX_BYTES) return { error: "settings.logo.errorSize" };

  const ext = LOGO_MIME_EXT[file.type];
  if (!ext) return { error: "settings.logo.errorType" };

  const supabase = await createClient();
  // Path convention (storage migration): <business_id>/logo-<epoch>.<ext>.
  // The first path segment MUST equal the tenant id — the storage RLS gates on it.
  const path = `${profile.business_id}/logo-${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("logos")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return { error: "settings.logo.error" };

  // Point the business row at the new object PATH (not a URL — reads are signed).
  const previous = (await getBusiness())?.logo_url ?? null;
  const { error: updateError } = await supabase
    .from("business")
    .update({ logo_url: path })
    .eq("id", profile.business_id);
  if (updateError) return { error: "settings.logo.error" };

  // Best-effort cleanup of the superseded object (never blocks the result).
  if (previous && previous !== path) {
    await supabase.storage.from("logos").remove([previous]);
  }

  revalidateSettings(profile.business_id);
  return { ok: true };
}

// --- Tax & registration config (stored in business.tax_config jsonb) ---------
export async function updateTaxConfig(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await requireRole(rolesFor("settings"));
  if (!profile.business_id) return { error: "settings.tax.error" };

  const parsed = taxConfigSchema.safeParse({
    vatRatePercent: formData.get("vatRatePercent"),
    registered: formData.get("registered") === "on" || formData.get("registered") === "true",
    taxId: formData.get("taxId") ?? undefined,
  });
  if (!parsed.success) return { error: "settings.tax.error" };

  // Percent → integer basis points (8% → 800). Rounds once; no float is stored.
  const vatRateBps = Math.round(parsed.data.vatRatePercent * 100);
  const taxConfig = {
    vat_rate_bps: vatRateBps,
    registered: parsed.data.registered,
    // Registration id is only meaningful when registered; clear it otherwise.
    tax_id: parsed.data.registered ? (parsed.data.taxId ?? "") : "",
  };

  const supabase = await createClient();
  const { error } = await supabase
    .from("business")
    .update({ tax_config: taxConfig })
    .eq("id", profile.business_id);
  if (error) return { error: "settings.tax.error" };

  revalidateSettings(profile.business_id);
  return { ok: true };
}

// --- Notification preferences (stored in business.notification_preferences) --
export async function updateNotificationPreferences(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const profile = await requireRole(rolesFor("settings"));
  if (!profile.business_id) return { error: "settings.notifications.error" };

  // Unchecked checkboxes are simply absent from FormData → false.
  const raw = Object.fromEntries(
    NOTIFICATION_KEYS.map((key) => {
      const v = formData.get(key);
      return [key, v === "on" || v === "true"];
    }),
  );
  const parsed = notificationPreferencesSchema.safeParse(raw);
  if (!parsed.success) return { error: "settings.notifications.error" };

  // Re-project to a plain boolean map (the strict schema validated the shape).
  const preferences: Json = Object.fromEntries(
    NOTIFICATION_KEYS.map((key) => [key, parsed.data[key] === true]),
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from("business")
    .update({ notification_preferences: preferences })
    .eq("id", profile.business_id);
  if (error) return { error: "settings.notifications.error" };

  revalidateSettings(profile.business_id);
  return { ok: true };
}
