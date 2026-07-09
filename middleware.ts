// Root middleware — runs on every matched (document) request. Two jobs:
//   1. Keep the Supabase session fresh (lib/supabase/middleware.updateSession).
//   2. Emit a per-request Content-Security-Policy (CLAUDE.md §7.9).
//
// Why CSP lives here and not in next.config: a strong script-src needs a
// per-request NONCE, and a nonce can only be minted per request. In production
// we send `script-src 'self' 'nonce-<random>' 'strict-dynamic'` — no
// 'unsafe-inline' for scripts. We put the nonce on the forwarded REQUEST headers
// (via updateSession) so Next.js stamps it onto its own bootstrap/hydration
// <script> tags automatically; `'strict-dynamic'` then lets those trusted
// scripts load the chunk graph. In development we fall back to 'unsafe-inline'
// 'unsafe-eval' because React Fast Refresh / Turbopack need eval and inline.
//
// style-src keeps 'unsafe-inline': Next.js, Tailwind, and Recharts all emit
// inline style attributes/tags a nonce cannot cover (there is no widely
// supported inline-style nonce). This is the one documented allowance; see
// README + LOG.md.

import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { env } from "@/lib/env";

const isProd = process.env.NODE_ENV === "production";

// Supabase origins the browser must reach: the REST/Auth HTTPS origin, its
// realtime wss:// origin (connect-src), and Storage for images (img-src).
const supabaseWs = env.SUPABASE_URL.replace(/^https:/, "wss:");

function buildCsp(nonce: string | null): string {
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : // dev only: HMR / React Fast Refresh need eval + inline.
      `script-src 'self' 'unsafe-inline' 'unsafe-eval'`;

  return (
    [
      `default-src 'self'`,
      scriptSrc,
      // Inline styles are unavoidable (Next/Tailwind/Recharts); no script here.
      `style-src 'self' 'unsafe-inline'`,
      `img-src 'self' data: blob: ${env.SUPABASE_URL}`,
      `font-src 'self'`,
      `connect-src 'self' ${env.SUPABASE_URL} ${supabaseWs}${isProd ? "" : " ws:"}`,
      `object-src 'none'`,
      `base-uri 'self'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
      `upgrade-insecure-requests`,
    ].join("; ") + ";"
  );
}

export async function middleware(request: NextRequest) {
  // A fresh, unguessable nonce per request (production only — see above).
  const nonce = isProd ? Buffer.from(crypto.randomUUID()).toString("base64") : null;
  const csp = buildCsp(nonce);

  // Forward the nonce + CSP to the app on the request headers: Next reads the
  // nonce out of the request CSP header and applies it to its <script> tags.
  const requestHeaders = new Headers(request.headers);
  if (nonce) requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = await updateSession(request, requestHeaders);
  // And set it on the response so the browser actually enforces it.
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // Run on all paths EXCEPT static assets and image files — those never carry a
  // session and don't need a per-request CSP (the static headers in
  // next.config.ts still cover them).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
