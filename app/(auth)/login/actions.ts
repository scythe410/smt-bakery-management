"use server";

// Sign-in server action. Runs on the server so the session cookies are written
// server-side by @supabase/ssr (see lib/supabase/server.ts). Input is validated
// with Zod (CLAUDE.md §7.6); the returned `error` is a translation KEY, resolved
// to copy on the client via i18next.

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { signInSchema } from "@/lib/zod/auth";

export type SignInState = { error?: string };

export async function signIn(
  _prevState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "login.errorMissing" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // 400 = invalid_credentials (wrong email/password). Anything else (network,
    // rate limit, server) is a generic failure — don't leak specifics.
    return { error: error.status === 400 ? "login.errorInvalid" : "login.errorGeneric" };
  }

  // Success: redirect throws NEXT_REDIRECT, which propagates out of the action.
  redirect("/dashboard");
}
