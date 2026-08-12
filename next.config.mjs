/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

// Content Security Policy.
// - 'unsafe-inline' / 'unsafe-eval' on script-src: Next.js inlines hydration
//   bootstrap and uses eval in dev. Acceptable for an internal GxP app where
//   XSS is not the primary threat model.
// - va.vercel-scripts.com, vitals.vercel-insights.com: Vercel Analytics and
//   Speed Insights. Gemini / Anthropic are server-side only and don't need
//   client allowances.
const cspDirectives = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://va.vercel-scripts.com https://vitals.vercel-insights.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join('; ');

const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control',    value: 'on' },
  { key: 'X-Content-Type-Options',    value: 'nosniff' },
  { key: 'X-Frame-Options',           value: 'DENY' },
  { key: 'X-XSS-Protection',          value: '1; mode=block' },
  { key: 'Referrer-Policy',           value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy',        value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Content-Security-Policy',   value: cspDirectives },
  ...(isProd ? [{
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  }] : []),
];

const nextConfig = {
  reactStrictMode: true,
  // gzip/br compression of server responses (HTML, JSON, JS).
  compress: true,
  // Don't leak the framework version header.
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: isProd
      ? ['mongoose']
      : ['mongoose', 'mongodb-memory-server'],
    // Transform barrel imports (e.g. lucide-react) into direct per-icon
    // imports at build time. Harmless win; lucide-react is imported in 26 files.
    optimizePackageImports: ['lucide-react'],
  },
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
};

export default nextConfig;
