// server.ts — Supabase client for SERVER Components / Server Actions / Route
// Handlers. @supabase/ssr, cookie-based sessions read from next/headers.
//
// `import "server-only"` makes it a build error to import this module into a
// Client Component — a hard guarantee that server session handling never ships
// to the browser (CLAUDE.md §7.4/§7.5).
//
// A fresh client is created per request (cookies() is request-scoped); never
// cache one across requests. Still uses the anon key + RLS — this is NOT an
// admin/service_role client, so tenant isolation is enforced by the database.

import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component, where cookies are read-only. Safe to
          // ignore: the middleware (lib/supabase/middleware.ts) refreshes and
          // writes the session cookies on every request.
        }
      },
    },
  });
}
