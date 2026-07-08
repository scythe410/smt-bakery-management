// client.ts — Supabase client for the BROWSER (Client Components). @supabase/ssr.
//
// Uses ONLY the public URL + anon key (env.ts guarantees those are the only
// values that ever reach the browser). Cookie-based sessions are handled for us
// by createBrowserClient, which reads the same cookies the server writes, so a
// session established server-side is visible here and vice-versa.
//
// Call this inside Client Components; do not import it from server code
// (use lib/supabase/server.ts there).

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { env } from "@/lib/env";

export function createClient() {
  return createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);
}
