"use server";

// Sign-out server action. Clears the Supabase session (server-side cookie wipe)
// and returns the user to /login. Used by the shell's SignOutButton.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
