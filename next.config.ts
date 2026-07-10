import type { NextConfig } from "next";

// NOTE on Content-Security-Policy: CSP is NOT set here. It needs a per-request
// nonce for a strict script-src, so it is emitted in middleware.ts (which runs
// per request and can mint a nonce). These static headers below carry no
// per-request state, so they stay here and apply to every path — including the
// static assets the middleware matcher skips. See CLAUDE.md §7.9, middleware.ts.
const securityHeaders = [
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
    // Logo upload (Settings) posts the image through a Server Action. The app
    // allows up to 2MB (LOGO_MAX_BYTES, matching the 'logos' bucket), but Next's
    // default Server Action body limit is 1MB — a valid logo was rejected at the
    // transport layer ("Body exceeded 1 MB limit") before the action's own size
    // check ran. Raise it to cover 2MB + multipart/form overhead.
    serverActions: {
      bodySizeLimit: "3mb",
    },
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
