"use server";

// Shell server actions: sign-out and language preference.

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
 * change their OWN language (never role/business_id). CLAUDE.md §3.
 *
 * The UI switches CLIENT-SIDE the instant the user taps (i18n.changeLanguage);
 * this action is called fire-and-forget purely to persist the choice for the
 * next fresh load's first paint. It deliberately does NOT revalidate — a layout
 * revalidation would re-render the whole shell + current route across the region
 * gap, which is exactly the cost we're removing. So no navigation, no refetch.
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
}
