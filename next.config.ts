import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy.
 *
 * Started strict per CLAUDE.md §7.9. Current known allowances:
 * - script-src 'unsafe-inline': Next.js injects inline bootstrap/hydration scripts.
 *   TODO: replace with a per-request nonce once middleware exists (added with Supabase).
 * - script-src 'unsafe-eval' (dev only): required by Turbopack/React Fast Refresh.
 * - style-src 'unsafe-inline': Next.js and CSS-var-driven inline styles.
 * - img-src data:/blob:: monogram/skeleton placeholders and future uploaded images.
 *
 * To add when Supabase lands:
 * - connect-src: <NEXT_PUBLIC_SUPABASE_URL> and its realtime wss:// origin.
 * - img-src: the Supabase Storage origin (logos / item images).
 */
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  `connect-src 'self'${isDev ? " ws:" : ""}`,
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
