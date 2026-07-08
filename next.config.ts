import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// Supabase origins the browser must reach: the REST/Auth HTTPS origin plus its
// realtime wss:// origin (connect-src), and Storage for images (img-src).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseWs = supabaseUrl.replace(/^https:/, "wss:");
const supabaseConnect = [supabaseUrl, supabaseWs].filter(Boolean).join(" ");

/**
 * Content-Security-Policy.
 *
 * Started strict per CLAUDE.md §7.9. Current known allowances:
 * - script-src 'unsafe-inline': Next.js injects inline bootstrap/hydration scripts.
 *   TODO: replace with a per-request nonce once middleware exists (added with Supabase).
 * - script-src 'unsafe-eval' (dev only): required by Turbopack/React Fast Refresh.
 * - style-src 'unsafe-inline': Next.js and CSS-var-driven inline styles.
 * - img-src data:/blob:: monogram/skeleton placeholders and future uploaded images.
 * - connect-src / img-src <supabase>: Auth + Data API, realtime, and Storage.
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:${supabaseUrl ? ` ${supabaseUrl}` : ""}`,
  `font-src 'self'`,
  `connect-src 'self'${supabaseConnect ? ` ${supabaseConnect}` : ""}${isDev ? " ws:" : ""}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
]
  .join("; ")
  .concat(";");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), browsing-topics=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Enables forbidden()/unauthorized() + app/forbidden.tsx for server-side role
  // gating (lib/auth.requireRole → real HTTP 403). CLAUDE.md §5, §7.5.
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
