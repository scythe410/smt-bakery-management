// env.ts — validate required environment at boot. CLAUDE.md §7 (4, 10).
//
// Two tiers, deliberately separated so a secret can never leak to the browser:
//
//   * `env` (below) holds ONLY the public NEXT_PUBLIC_* values (URL, anon key,
//     site URL). Next.js inlines these into the client bundle, so they are
//     safe to import from anywhere — browser or server. Validated at module
//     load: a missing/blank value fails fast at boot, not at first request.
//
//   * `getServiceRoleKey()` is the ONLY accessor for SUPABASE_SERVICE_ROLE_KEY.
//     It is a function, never a top-level constant, and it throws if called in
//     a browser context. Combined with the fact that the var is NOT prefixed
//     NEXT_PUBLIC_ (so Next never inlines it client-side), the service_role key
//     cannot reach the client. Server code should reach for it only inside a
//     `server-only` module (see lib/supabase/server.ts).
//
// We validate with a tiny hand-rolled check rather than a schema lib so this
// module has zero dependencies and can load in every runtime (edge middleware,
// server, browser) without pulling anything in.

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

// --- Public env (safe on both client and server) -------------------------
// Read as static property accesses (not process.env[dynamic]) so Next.js can
// statically inline them into the client bundle.
export const env = {
  SUPABASE_URL: required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
  SUPABASE_ANON_KEY: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
  SITE_URL: required("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL),
} as const;

// --- Server-only secret --------------------------------------------------
/**
 * Return the Supabase service_role key. Server-only: throws if reached from the
 * browser. Never assign the result to a module-level export or pass it to a
 * client component — treat it as a live credential.
 */
export function getServiceRoleKey(): string {
  if (typeof window !== "undefined") {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY was accessed in the browser. It is server-only " +
        "and must never be imported into client code (CLAUDE.md §7.4).",
    );
  }
  return required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
}
