// auth.ts — server-side session, profile, and role gating. CLAUDE.md §5, §7.5.
//
// `server-only` so this never ships to the browser. All reads go through the
// RLS-scoped server client (anon key), so even these helpers can only ever see
// the caller's own tenant — role gating here is defence-in-depth on top of RLS,
// not a substitute for it.
//
// getUser / getProfile / getBusiness are wrapped in React `cache()`, so within a
// single request the layout, page, and shell header share one auth round-trip
// instead of re-querying.

import "server-only";
import { cache } from "react";
import { forbidden, redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { toLanguage, type Language } from "@/i18n/config";
import type { AppRole } from "@/lib/access";

// The role → section access matrix lives in lib/access.ts (client-safe) so the
// server gate here and the client nav share one source of truth. Re-exported for
// existing server callers that import these from "@/lib/auth".
export { SECTION_ROLES, rolesFor, canAccess, type Section, type AppRole } from "@/lib/access";

export type Profile = Database["public"]["Tables"]["profile"]["Row"];
export type Business = Database["public"]["Tables"]["business"]["Row"];

/** The authenticated auth.users row, revalidated against the auth server, or null. */
export const getUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** The caller's profile row (role, language_pref, …), or null when signed out. */
export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profile").select("*").eq("id", user.id).maybeSingle();
  return data;
});

/** The caller's tenant, or null when signed out / not yet assigned a business. */
export const getBusiness = cache(async (): Promise<Business | null> => {
  const profile = await getProfile();
  if (!profile?.business_id) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("business")
    .select("*")
    .eq("id", profile.business_id)
    .maybeSingle();
  return data;
});

/** Active UI language: the caller's preference, else the default. Safe pre-auth. */
export async function getCurrentLanguage(): Promise<Language> {
  const profile = await getProfile();
  return toLanguage(profile?.language_pref);
}

/**
 * Require an authenticated user with a profile. Unauthenticated → redirect to
 * /login (CLAUDE.md §7.5). Returns the profile so callers avoid a second fetch.
 */
export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

/**
 * Require the caller's role to be in `allowed`. Unauthenticated → /login;
 * authenticated-but-wrong-role → 403 via forbidden() (CLAUDE.md §5, §7.5).
 * This is the SERVER gate — never rely on hiding the route in the UI alone.
 */
export async function requireRole(allowed: readonly AppRole[]): Promise<Profile> {
  const profile = await requireProfile();
  if (!allowed.includes(profile.role)) {
    forbidden();
  }
  return profile;
}
