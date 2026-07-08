"use server";

// Shell server actions: sign-out and language preference.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { languagePrefSchema } from "@/lib/zod/profile";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * Persist the caller's language preference to profile.language_pref. Input is
 * validated server-side; RLS + the freeze trigger ensure a user can only ever
 * change their OWN language (never role/business_id). Revalidating the layout
 * re-runs the root layout so <html lang>, the Sinhala font, and the i18n
 * instance all pick up the new language (CLAUDE.md §3).
 */
export async function setLanguage(next: string): Promise<void> {
  const parsed = languagePrefSchema.safeParse(next);
  if (!parsed.success) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("profile").update({ language_pref: parsed.data }).eq("id", user.id);
  revalidatePath("/", "layout");
}
