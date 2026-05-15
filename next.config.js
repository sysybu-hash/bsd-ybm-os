const path = require("path");

/**
 * No legacy redirects.
 */
const LEGACY_REDIRECTS = [];

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
          "camera=(), microphone=(self), geolocation=(), interest-cohort=(), browsing-topics=()",
      },
    ];
    if (isProd) {
      security.push({
        key: "Strict-Transport-Security",
        value: "max-age=63072000; includeSubDomains; preload",
      });
    }
    return [
      {
        source: "/:path*",
        headers: security,
      },
    ];
  },
  async redirects() {
    return [];
  },
  transpilePackages: ["react-signature-canvas", "signature_pad"],
  serverExternalPackages: ["pdf-parse"],
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

module.exports = nextConfig;
