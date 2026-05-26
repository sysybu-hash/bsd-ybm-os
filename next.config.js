const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** Legacy `/os` workspace path → root workspace (query preserved). */
const LEGACY_REDIRECTS = [{ source: "/os", destination: "/", permanent: false }];

/** Allow common local dev ports to avoid Next dev cross-origin warnings. */
function buildAllowedDevOrigins() {
  const set = new Set([
    "http://127.0.0.1:3000",
    "http://localhost:3000",
    "http://127.0.0.1",
    "http://localhost",
    "127.0.0.1",
    "localhost",
    "127.0.0.1:3000",
    "localhost:3000",
  ]);
  const hosts = ["127.0.0.1", "localhost"];
  const extraPorts = [3001, 3002, 3003, 3004, 3005, 3330, 3331, 3332, 3333, 4173, 5173, 5321];
  for (const h of hosts) {
    for (const p of extraPorts) {
      set.add(`http://${h}:${p}`);
      set.add(`${h}:${p}`);
    }
  }
  return Array.from(set);
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname),
  allowedDevOrigins: buildAllowedDevOrigins(),
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "SAMEORIGIN" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      {
        key: "Permissions-Policy",
        value:
          "camera=(self), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=()",
      },
    ];
    if (isProd) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://*.paypal.com https://*.posthog.com https://*.i.posthog.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.googleapis.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://*.posthog.com https://*.i.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://*.paypal.com https://*.payplus.co.il wss://generativelanguage.googleapis.com",
        "frame-src https://www.paypal.com https://*.paypal.com https://payplus.co.il https://*.payplus.co.il",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "upgrade-insecure-requests",
      ].join("; ");
      security.push({ key: "Content-Security-Policy", value: csp });
    }
    return [
      {
        source: "/:path*",
        headers: security,
      },
    ];
  },
  async redirects() {
    return LEGACY_REDIRECTS;
  },
  transpilePackages: ["react-signature-canvas", "signature_pad"],
  serverExternalPackages: ["pdf-parse", "@sparticuz/chromium", "puppeteer-core", "archiver"],
  outputFileTracingIncludes: {
    "/api/documents/issued/[id]/export": [
      "./lib/pdf/font-data.generated.ts",
      "./lib/pdf/fonts/**",
      "./lib/pdf/invoice-print-html.ts",
      "./lib/pdf/render-invoice-pdf-chromium.ts",
      "./lib/pdf/load-pdf-font-buffers.ts",
      "./node_modules/@sparticuz/chromium/**",
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
};

module.exports = withBundleAnalyzer(nextConfig);
