import type { NextConfig } from "next";

const dev = process.env.NODE_ENV === "development";

/**
 * Security headers for every route. CSP notes:
 * - script/style need 'unsafe-inline' (Next inline bootstrap + Tailwind);
 *   tightening to nonces is tracked as a follow-up.
 * - connect-src allows Supabase (attachment signed-URL uploads/downloads).
 * - form-action allows PayFast (the checkout POSTs a plain form there).
 * - img-src allows Google avatars; microphone stays self-only (voice capture).
 * - dev adds eval + websockets for HMR.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self'",
  `connect-src 'self' https://*.supabase.co${dev ? " ws: wss:" : ""}`,
  "media-src 'self' blob:",
  "form-action 'self' https://www.payfast.co.za https://sandbox.payfast.co.za",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=()",
  },
  ...(dev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
