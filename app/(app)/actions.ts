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

// Fire-and-forget: the UI switches client-side instantly; this just persists the
// choice for the next fresh load. No revalidatePath — a layout revalidation would
// re-render the whole shell, which defeats the point of the instant-switch.
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
