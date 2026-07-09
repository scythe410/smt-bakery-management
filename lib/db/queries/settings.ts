// queries/settings.ts — raw, tenant-scoped reads for the Settings screen.
//
// Reads go through the RLS-scoped server client. listTenantProfiles relies on
// the owner/manager tenant-read policy on `profile` (migration 004); staff would
// see only its own row, but Settings is owner-only so the caller is an owner.
// No derivation here — shaping lives in lib/db/selectors/settings.ts.

import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";

export type ProfileRow = Database["public"]["Tables"]["profile"]["Row"];

/** All login accounts (profiles) in this tenant, ordered by name (A→Z). */
export async function listTenantProfiles(): Promise<ProfileRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profile")
    .select("id, business_id, name, role, language_pref, created_at, updated_at")
    .order("name", { ascending: true });

  if (error) throw error;
  return (data ?? []) as ProfileRow[];
}

/**
 * A short-lived signed URL for a private logo object PATH (buckets are private,
 * CLAUDE.md §7.8). Returns null when there is no logo or signing fails, so the
 * caller falls back to the monogram (DESIGN.md §5) — never a broken image.
 */
export async function signLogoUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage.from("logos").createSignedUrl(path, 60 * 60);
  if (error || !data) return null;
  return data.signedUrl;
}
