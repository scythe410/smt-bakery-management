// middleware.ts (helper) — refresh the Supabase session on every request.
// @supabase/ssr. Called from the root middleware.ts.
//
// Why this exists: server-side auth tokens expire. Without a refresh on each
// request, a user's session silently dies mid-visit. createServerClient here
// reads cookies from the incoming request and writes refreshed cookies onto the
// outgoing response, so the session stays alive and both the browser client and
// server client see the same up-to-date session.
//
// Scope of THIS step: session refresh only. Route protection / role-gated
// redirects are wired in the auth step; keep this pure so it never accidentally
// blocks a route.
//
// `requestHeaders` is the (cloned) set of headers the caller wants forwarded to
// the app — the root middleware uses it to carry the per-request CSP nonce so
// Next can stamp it onto its own <script> tags (see middleware.ts). We forward
// exactly those headers, so the session refresh and the nonce cooperate.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/types";
import { env } from "@/lib/env";

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse> {
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Mirror refreshed cookies onto BOTH the request (so downstream reads in
        // this same pass see them) and a fresh response (what the browser gets),
        // preserving the forwarded headers (the nonce) on the rebuilt response.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Revalidate the user against the auth server. This is the call that triggers
  // a token refresh when needed. Do NOT insert logic between createServerClient
  // and this line — the docs warn it can cause hard-to-debug session drops.
  //
  // A stale or already-rotated refresh token makes this THROW an AuthApiError
  // (`refresh_token_not_found`). Refresh tokens rotate on use, so a page load and
  // a near-simultaneous server-action POST can race on the same token — one wins,
  // the other throws. Left uncaught, that 500s the request; because middleware
  // runs on every matched request, it silently breaks mutations (e.g. creating an
  // order) even though the DB/RLS are fine. Swallow it: a failed refresh just
  // means "no valid session" — clear the client's stale cookies and let the auth
  // gate redirect to /login on the next hop instead of erroring the whole request.
  try {
    await supabase.auth.getUser();
  } catch {
    await supabase.auth.signOut({ scope: "local" }).catch(() => {});
  }

  return response;
}
