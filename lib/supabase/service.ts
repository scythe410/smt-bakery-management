// service.ts — Supabase client that uses the SERVICE_ROLE key and carries NO
// cookie/session. It exists for ONE purpose: reads that run inside a Next.js
// cache scope (`unstable_cache`), where the cookie-based RLS client cannot be
// used — a cache scope may not read `cookies()`, and its result is keyed by
// explicit inputs, not by the request's session. See lib/db/cache.ts.
//
// ┌─ SECURITY (CLAUDE.md §7) ─────────────────────────────────────────────────┐
// │ This client BYPASSES RLS. Tenant isolation is therefore NOT automatic — it │
// │ is the caller's responsibility. Every query MUST be explicitly scoped with │
// │ `.eq("business_id", <id>)`, where the id was resolved SERVER-SIDE from the  │
// │ authenticated profile (never from client input). To make that impossible   │
// │ to forget, this client is only ever handed out paired with its business id  │
// │ inside a `DbScope` (lib/db/cache.ts) — the two travel together.             │
// │                                                                             │
// │ READS ONLY. Never use this client for writes: all mutations stay on the     │
// │ RLS-scoped server client (lib/supabase/server.ts) so the database enforces  │
// │ tenancy on every insert/update/delete.                                      │
// └─────────────────────────────────────────────────────────────────────────────┘
//
// `import "server-only"` + `getServiceRoleKey()` (which throws in the browser
// and is never NEXT_PUBLIC_) guarantee the key never reaches the client (§7.4).

import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { env, getServiceRoleKey } from "@/lib/env";

export type ServiceClient = SupabaseClient<Database>;

/** A fresh service-role client. No session, no token refresh — pure server reads. */
export function createServiceClient(): ServiceClient {
  return createClient<Database>(env.SUPABASE_URL, getServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
