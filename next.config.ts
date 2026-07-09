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
