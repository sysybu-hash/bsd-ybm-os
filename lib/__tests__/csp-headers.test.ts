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

async function headersFor(env: { NODE_ENV?: string; CSP_STRICT?: string }): Promise<HeaderRule[]> {
  const prev = { NODE_ENV: process.env.NODE_ENV, CSP_STRICT: process.env.CSP_STRICT };
  // NODE_ENV is readonly in the Next types but writable at runtime.
  (process.env as Record<string, string | undefined>).NODE_ENV = env.NODE_ENV;
  (process.env as Record<string, string | undefined>).CSP_STRICT = env.CSP_STRICT;
  try {
    jest.resetModules();
    const config = require("../../next.config.js") as { headers: () => Promise<HeaderRule[]> };
    return await config.headers();
  } finally {
    (process.env as Record<string, string | undefined>).NODE_ENV = prev.NODE_ENV;
    (process.env as Record<string, string | undefined>).CSP_STRICT = prev.CSP_STRICT;
  }
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
