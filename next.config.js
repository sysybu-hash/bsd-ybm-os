const path = require("path");

/**
 * What reading a floor plan actually costs to carry.
 *
 * pdfjs parses the sheet; @napi-rs/canvas rasterises the page and draws the
 * caption. Both are external packages behind a dynamic import, so nothing in
 * the graph points at them and tracing leaves them out.
 */
const PDF_READER_FILES = [
  "./node_modules/pdfjs-dist/legacy/build/**",
  "./node_modules/pdfjs-dist/standard_fonts/**",
  "./node_modules/pdfjs-dist/package.json",
  "./node_modules/@napi-rs/canvas/**",
  "./node_modules/@napi-rs/canvas-*/**",
];
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
  openAnalyzer: false,
});

/** Legacy `/os` workspace path → root workspace (query preserved). */
const LEGACY_REDIRECTS = [
  { source: "/os", destination: "/", permanent: false },
  /**
   * OAuth / NextAuth: עוגיות state/PKCE חייבות להיות על אותו host כמו NEXTAUTH_URL (www).
   * גישה ל-apex בלי www גורמת ל-error=OAuthCallback אחרי Google.
   */
  {
    source: "/:path*",
    has: [{ type: "host", value: "bsd-ybm.co.il" }],
    destination: "https://www.bsd-ybm.co.il/:path*",
    permanent: true,
  },
];

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
    // A production build served over plain HTTP — the nightly E2E server on
    // http://127.0.0.1:3001 — must not tell the browser to upgrade itself.
    // With upgrade-insecure-requests, signing in redirected / to /home, the
    // browser rewrote that to https://127.0.0.1:3001/home, and the page died on
    // ERR_SSL_PROTOCOL_ERROR: every signed-in nightly test failed on it, every
    // morning. The live site is https and keeps both headers.
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "";
    const servedOverHttps = !siteUrl.startsWith("http://");
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
      // Only the two directives that assume https depend on it; the rest of
      // the policy is sent either way.
      if (servedOverHttps) {
        security.push({
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        });
      }
      const cspStrict =
        process.env.CSP_STRICT === "true" || process.env.CSP_STRICT === "1";
      const scriptSrc = cspStrict
        ? "script-src 'self' 'unsafe-inline' https://www.paypal.com https://*.paypal.com https://*.posthog.com https://*.i.posthog.com https://unpkg.com"
        : "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://*.paypal.com https://*.posthog.com https://*.i.posthog.com https://unpkg.com https://cdn.tailwindcss.com";
      const csp = [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "frame-ancestors 'self'",
        scriptSrc,
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com",
        "font-src 'self' data: https://fonts.gstatic.com",
        "img-src 'self' data: blob: https:",
        "connect-src 'self' https://*.googleapis.com https://generativelanguage.googleapis.com https://api.anthropic.com https://api.openai.com https://*.posthog.com https://*.i.posthog.com https://*.sentry.io https://*.ingest.sentry.io https://*.paypal.com wss://generativelanguage.googleapis.com",
        // 'self' is required for the App Builder preview: the workspace frames
        // its own /api/app-builder/preview document. frame-src overrides
        // default-src for frames, so without it the browser refuses to embed a
        // same-origin page — "Framing ... violates the following Content
        // Security Policy directive". Verified on production before the fix.
        "frame-src 'self' https://www.paypal.com https://*.paypal.com",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        ...(servedOverHttps ? ["upgrade-insecure-requests"] : []),
      ].join("; ");
      security.push({ key: "Content-Security-Policy", value: csp });
    }
    const longCache = "public, max-age=31536000, immutable";
    const assetCache = [
      { source: "/marketing/:path*", headers: [{ key: "Cache-Control", value: longCache }] },
      { source: "/screenshots/:path*", headers: [{ key: "Cache-Control", value: longCache }] },
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: longCache }] },
    ];
    /**
     * The App Builder preview document needs 'unsafe-eval' (@babel/standalone
     * compiles the user's JSX in the browser) and the Tailwind CDN. Under
     * CSP_STRICT the site policy grants neither, and a header set by the route
     * handler does not survive: entries here are applied afterwards and win on
     * a duplicate key, which is why an earlier attempt to scope this from inside
     * the route silently kept the global policy.
     *
     * Declaring it here, after the catch-all, is what actually overrides it —
     * and it stays scoped to this one path, so the rest of the site keeps the
     * strict policy. `connect-src 'none'` is the important line: the preview
     * runs AI-generated code, and that is what stops it calling home.
     */
    const previewCsp = [
      "default-src 'none'",
      "script-src https://unpkg.com https://cdn.tailwindcss.com 'unsafe-inline' 'unsafe-eval'",
      "style-src 'unsafe-inline'",
      "img-src data: blob:",
      "font-src data:",
      "connect-src 'none'",
      "frame-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ].join("; ");

    return [
      ...assetCache,
      {
        source: "/:path*",
        headers: security,
      },
      {
        source: "/api/app-builder/preview",
        headers: [{ key: "Content-Security-Policy", value: previewCsp }],
      },
    ];
  },
  async redirects() {
    return LEGACY_REDIRECTS;
  },
  transpilePackages: ["react-signature-canvas", "signature_pad", "@hebcal/core"],
  serverExternalPackages: [
    "pdf-parse",
    "@sparticuz/chromium",
    "puppeteer-core",
    "archiver",
    // Bundling it breaks the fake worker: pdfjs dynamically imports
    // pdf.worker.mjs at runtime and the bundler does not emit it into the
    // server chunks, so every getDocument call failed with "Setting up fake
    // worker failed". Left external, Node resolves it from node_modules.
    "pdfjs-dist",
    // Native Skia bindings. Bundling them breaks the .node resolution the
    // booklet's caption bar and sheet page depend on.
    "@napi-rs/canvas",
  ],
  outputFileTracingIncludes: {
    "/api/documents/issued/[id]/export": [
      "./lib/pdf/font-data.generated.ts",
      "./lib/pdf/fonts/**",
      "./lib/pdf/invoice-print-html.ts",
      "./lib/pdf/render-invoice-pdf-chromium.ts",
      "./lib/pdf/load-pdf-font-buffers.ts",
      "./node_modules/@sparticuz/chromium/**",
    ],
    // The booklet is rendered by Chromium and captioned by @napi-rs/canvas,
    // and both read files at runtime: the Hebrew fonts the stamp registers and
    // the logo the cover prints. Tracing misses them because nothing imports
    // them — they are opened by path.
    "/api/projects/visualize-floorplan/export-pdf": [
      "./lib/pdf/fonts/**",
      "./lib/pdf/load-pdf-font-buffers.ts",
      "./public/logos/**",
      "./node_modules/@sparticuz/chromium/**",
      ...PDF_READER_FILES,
    ],
    // pdfjs and the Skia bindings are serverExternalPackages, loaded through a
    // dynamic import so Node resolves them from node_modules — and tracing
    // therefore never sees them. On the platform every read of a sheet's
    // vectors, its printed areas, its text layer and its raster came back
    // empty, silently: 28-8-23-2 reported "no vector walls" for a drawing that
    // reads as 5,326 segments on a laptop. Named here so the functions that
    // read a plan actually carry what they read it with.
    "/api/projects/visualize-floorplan": [
      "./lib/pdf/fonts/**",
      "./lib/pdf/load-pdf-font-buffers.ts",
      // The deterministic renderer draws the measured flat in a headless
      // Chromium and serves three.js to it off disk. Nothing imports those
      // files — the page fetches them from an origin that exists only inside
      // the browser — so tracing cannot see them.
      "./node_modules/three/build/three.module.js",
      "./node_modules/three/build/three.core.js",
      "./node_modules/@sparticuz/chromium/**",
      ...PDF_READER_FILES,
    ],
    "/api/projects/visualize-floorplan/inspect": [...PDF_READER_FILES],
    "/api/projects/visualize-floorplan/[id]/stills/[stillId]": [
      "./lib/pdf/fonts/**",
      "./lib/pdf/load-pdf-font-buffers.ts",
      ...PDF_READER_FILES,
    ],
  },
  // Nothing a serverless function runs needs the promo videos, the product
  // PDFs, a Playwright report or the local scratch folders — and a function
  // that carries them can cross Vercel's 250MB uncompressed limit.
  outputFileTracingExcludes: {
    "**": [
      "./public/marketing/**",
      "./docs/**",
      "./playwright-report/**",
      "./test-results/**",
      "./tmp/**",
      // Both forms: the scratch folders and the loose booklets beside them.
      "./tmp-*/**",
      "./tmp-*",
      "./.cache/**",
      "./e2e/**",
      "./assets/**",
      "./public/screenshots/**",
      "./reports/**",
      "./playwright.config.ts",
      "./תוכניות לביצוע הדמיות/**",
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
  // Extend the default limited-bots list to include the Lighthouse programmatic API UA.
  // Lighthouse sets Chrome version as X.0.0.0 (all-zero patch); real Chrome uses X.0.XXXX.XXX.
  // This prevents Next.js from streaming metadata outside <head> for Lighthouse audits,
  // fixing the meta-description SEO audit on force-dynamic routes.
  // Googlebot added explicitly (the default Next.js pattern misses it — it only matches Google-X/X-Google).
  htmlLimitedBots:
    /[\w-]+-Google|Google-[\w-]+|Googlebot|Chrome-Lighthouse|Slurp|DuckDuckBot|baiduspider|yandex|sogou|bitlybot|tumblr|vkShare|quora link preview|redditbot|ia_archiver|Bingbot|BingPreview|applebot|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|SkypeUriPreview|Yeti|googleweblight|Chrome\/\d+\.0\.0\.0/,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    optimizePackageImports: ["lucide-react", "framer-motion", "@headlessui/react"],
    // cssChunking: "strict" removed in the Next 16 upgrade — it is webpack-only,
    // and Next 16 builds with Turbopack by default. Turbopack does its own CSS
    // chunking. Re-measure LCP with `npm run lighthouse:matrix:prod` before
    // concluding anything about the perf impact.
    // inlineCss disabled: the CSS chunks (~27KB gzip total) are smaller than the
    // overhead added by inlining into HTML (pushes LCP element deeper into HTML stream).
    // inlineCss: true,
  },
};

module.exports = withBundleAnalyzer(nextConfig);
