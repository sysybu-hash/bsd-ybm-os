/**
 * Guards the production CSP.
 *
 * These invariants cannot be covered by E2E: the policy is only emitted when
 * `isProd`, and the E2E suite runs against `next dev`, which sends no CSP at
 * all. That gap is exactly how the App Builder preview shipped broken twice —
 * once because a `srcdoc` iframe inherits the parent policy and so could not get
 * `'unsafe-eval'`, and again because `frame-src` did not allow `'self'`, so the
 * workspace was refused permission to frame its own preview document. Both
 * looked fine locally.
 *
 * next.config.js is a CommonJS module whose `headers()` is async and reads
 * `NODE_ENV` / `CSP_STRICT` at call time, so the test drives it directly.
 */

type HeaderEntry = { key: string; value: string };
type HeaderRule = { source: string; headers: HeaderEntry[] };

async function headersFor(env: {
  NODE_ENV?: string;
  CSP_STRICT?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}): Promise<HeaderRule[]> {
  const keys = ["NODE_ENV", "CSP_STRICT", "NEXT_PUBLIC_SITE_URL"] as const;
  const vars = process.env as Record<string, string | undefined>;
  const prev = Object.fromEntries(keys.map((k) => [k, vars[k]]));
  // NODE_ENV is readonly in the Next types but writable at runtime.
  for (const k of keys) vars[k] = env[k];
  try {
    jest.resetModules();
    const config = require("../../next.config.js") as { headers: () => Promise<HeaderRule[]> };
    return await config.headers();
  } finally {
    for (const k of keys) vars[k] = prev[k];
  }
}

function headerValue(rules: HeaderRule[], source: string, key: string): string | undefined {
  const rule = [...rules].reverse().find((r) => r.source === source);
  return rule?.headers.find((h) => h.key === key)?.value;
}

function cspFor(rules: HeaderRule[], source: string): string {
  const rule = [...rules].reverse().find((r) => r.source === source);
  return rule?.headers.find((h) => h.key === "Content-Security-Policy")?.value ?? "";
}

const PREVIEW_ROUTE = "/api/app-builder/preview";

describe("production CSP", () => {
  it("lets the app frame its own preview document", async () => {
    const rules = await headersFor({ NODE_ENV: "production", CSP_STRICT: "true" });
    const site = cspFor(rules, "/:path*");

    const frameSrc = site.split(";").map((d) => d.trim()).find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toBeDefined();
    // frame-src overrides default-src for frames, so 'self' has to be explicit.
    expect(frameSrc).toContain("'self'");
  });

  it("keeps the site policy strict when CSP_STRICT is on", async () => {
    const rules = await headersFor({ NODE_ENV: "production", CSP_STRICT: "true" });
    const site = cspFor(rules, "/:path*");

    const scriptSrc = site.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src")) ?? "";
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    expect(scriptSrc).not.toContain("cdn.tailwindcss.com");
  });

  it("gives the preview route its own widened policy, declared after the catch-all", async () => {
    const rules = await headersFor({ NODE_ENV: "production", CSP_STRICT: "true" });

    const catchAllIndex = rules.findIndex((r) => r.source === "/:path*");
    const previewIndex = rules.findIndex((r) => r.source === PREVIEW_ROUTE);
    expect(previewIndex).toBeGreaterThan(-1);
    // next.config headers() entries are applied in order and a later one wins on
    // a duplicate key. Declared earlier, the catch-all would overwrite this and
    // the preview would silently inherit the strict policy.
    expect(previewIndex).toBeGreaterThan(catchAllIndex);

    const preview = cspFor(rules, PREVIEW_ROUTE);
    // Babel compiles the user's JSX in the browser.
    expect(preview).toContain("'unsafe-eval'");
    // ...but the widening must stay scoped to this one document.
    expect(preview).toContain("default-src 'none'");
    // This frame runs AI-generated code. It must not be able to call out.
    expect(preview).toContain("connect-src 'none'");
  });

  it("scopes the preview policy to that route only", async () => {
    const rules = await headersFor({ NODE_ENV: "production", CSP_STRICT: "true" });
    const previewRules = rules.filter((r) => r.source === PREVIEW_ROUTE);
    expect(previewRules).toHaveLength(1);
    expect(previewRules[0]!.source).toBe(PREVIEW_ROUTE);
  });
});

describe("a production build served over plain HTTP", () => {
  // The nightly E2E server: NODE_ENV=production on http://127.0.0.1:3001.
  // upgrade-insecure-requests sent there rewrote the post-login redirect to
  // https and every signed-in test died on ERR_SSL_PROTOCOL_ERROR.
  it("keeps the policy but does not ask the browser to upgrade", async () => {
    const rules = await headersFor({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3001" });
    const site = cspFor(rules, "/:path*");
    expect(site).toContain("default-src 'self'");
    expect(site).toContain("frame-src 'self'");
    expect(site).not.toContain("upgrade-insecure-requests");
    expect(headerValue(rules, "/:path*", "Strict-Transport-Security")).toBeUndefined();
  });

  it("still upgrades and pins https on the live site", async () => {
    const rules = await headersFor({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://www.bsd-ybm.co.il" });
    expect(cspFor(rules, "/:path*")).toContain("upgrade-insecure-requests");
    expect(headerValue(rules, "/:path*", "Strict-Transport-Security")).toContain("max-age=63072000");
  });
});
