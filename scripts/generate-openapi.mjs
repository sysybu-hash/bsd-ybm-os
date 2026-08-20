#!/usr/bin/env node
/**
 * Generates an OpenAPI 3.1 skeleton by discovering every app/api/**\/route.ts,
 * its exported HTTP methods, and its auth guard (detected from source imports/usage).
 * The spec is an accurate route *inventory* — request/response schemas are added
 * incrementally per route. Output: docs/openapi.json + docs/API-INVENTORY.md.
 * Usage: node scripts/generate-openapi.mjs
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, sep } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = join(root, "app", "api");

/** @type {string[]} */
const routeFiles = [];
function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry === "route.ts") routeFiles.push(full);
  }
}
walk(apiRoot);

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

/** Convert an app-router file path into an OpenAPI path template. */
function toApiPath(file) {
  const rel = relative(apiRoot, dirname(file)).split(sep).join("/");
  const segments = rel
    .split("/")
    .filter(Boolean)
    .map((s) => s.replace(/^\[\.\.\.(.+)\]$/, "{$1}").replace(/^\[(.+)\]$/, "{$1}"));
  return "/api" + (segments.length ? "/" + segments.join("/") : "");
}

function detectAuth(src) {
  if (/withOSAdmin\b/.test(src)) return "os-admin";
  if (/withCronGuard\b|assertAnalyzeQueueProcessAuthorized\b/.test(src)) return "cron-secret";
  if (/withWorkspacesAuthDynamic\b/.test(src)) return "workspace-session";
  if (/withWorkspacesAuth\b/.test(src)) return "workspace-session";
  if (/verify\w*WebhookSignature|verifyWebhook|verifyPayPlus|readRawBody|gateway\.verifyWebhook/.test(src)) return "webhook-hmac";
  if (/getToken\b/.test(src)) return "jwt";
  return "public";
}

function detectRateLimit(src) {
  return /applyRateLimit|checkRateLimit|rateLimit:\s*\{/.test(src);
}

const paths = {};
const inventoryRows = [];
let count = 0;

for (const file of routeFiles.sort()) {
  const src = readFileSync(file, "utf8");
  const apiPath = toApiPath(file);
  const auth = detectAuth(src);
  const rateLimited = detectRateLimit(src);
  const methods = HTTP_METHODS.filter((mth) =>
    new RegExp(`export\\s+(const|async\\s+function|function)\\s+${mth}\\b`).test(src),
  );
  if (methods.length === 0) continue;

  paths[apiPath] = paths[apiPath] ?? {};
  for (const mth of methods) {
    count += 1;
    const security =
      auth === "public"
        ? []
        : auth === "cron-secret"
          ? [{ cronSecret: [] }]
          : auth === "webhook-hmac"
            ? [{ webhookSignature: [] }]
            : [{ sessionCookie: [] }];
    paths[apiPath][mth.toLowerCase()] = {
      summary: `${mth} ${apiPath}`,
      tags: [apiPath.split("/")[2] ?? "root"],
      security,
      "x-auth-guard": auth,
      "x-rate-limited": rateLimited,
      responses: {
        200: { description: "OK" },
        ...(auth !== "public" ? { 401: { description: "Unauthorized" } } : {}),
        ...(rateLimited ? { 429: { description: "Too Many Requests" } } : {}),
      },
    };
    inventoryRows.push(
      `| \`${mth}\` | \`${apiPath}\` | ${auth} | ${rateLimited ? "✓" : "—"} |`,
    );
  }
}

const spec = {
  openapi: "3.1.0",
  info: {
    title: "BSD-YBM OS API",
    version: "1.0.0",
    description:
      "Route inventory auto-derived from app/api. Auth guard + rate-limit flags reflect the actual source. Request/response schemas are filled in incrementally per route.",
  },
  servers: [{ url: "https://www.bsd-ybm.co.il" }],
  components: {
    securitySchemes: {
      sessionCookie: { type: "apiKey", in: "cookie", name: "next-auth.session-token" },
      cronSecret: { type: "http", scheme: "bearer", description: "CRON_SECRET bearer token" },
      webhookSignature: {
        type: "apiKey",
        in: "header",
        name: "signature",
        description: "HMAC-SHA256 over the raw body",
      },
    },
  },
  paths,
};

writeFileSync(join(root, "docs", "openapi.json"), JSON.stringify(spec, null, 2) + "\n", "utf8");

const md = `# API Inventory

> נוצר אוטומטית ע"י \`node scripts/generate-openapi.mjs\` מתוך \`app/api/**/route.ts\`.
> ${count} מסלולים (method + path). מקור מלא: [\`docs/openapi.json\`](./openapi.json).

| Method | Path | Auth guard | Rate-limited |
|--------|------|-----------|--------------|
${inventoryRows.join("\n")}
`;
writeFileSync(join(root, "docs", "API-INVENTORY.md"), md, "utf8");

console.log(`OpenAPI written: ${routeFiles.length} route files, ${count} operations`);
