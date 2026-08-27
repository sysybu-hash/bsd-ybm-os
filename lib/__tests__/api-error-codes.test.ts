import fs from "node:fs";
import path from "node:path";

/**
 * Every API error code a route emits must have a translation.
 *
 * The server's message is Hebrew — 927 such lines remain, and they are not the
 * problem, because `resolveApiErrorMessage` translates by `code` and only falls
 * back to the server text when a code has no key. What matters is that the
 * mapping stays complete: a new `jsonBadRequest(msg, "some_code")` with no
 * `apiErrors.some_code` silently shows Hebrew to an English user, and nothing
 * else in the pipeline notices.
 *
 * Scanning the routes rather than maintaining a list means this cannot drift.
 */
const ROOT = path.join(__dirname, "..", "..");

function collectRouteFiles(dir: string, acc: string[] = []): string[] {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) collectRouteFiles(p, acc);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) acc.push(p);
  }
  return acc;
}

/**
 * The error helpers exported by lib/api-json.ts, and only those.
 *
 * Matching `json[A-Za-z]+(` generally is too loose: it also catches
 * `NextResponse.json({ status: "sent" }, ...)` and enum pairs like
 * `"locations", "zones"`, which are success values rather than error codes.
 */
const ERROR_HELPERS = [
  "jsonUnauthorized", "jsonForbidden", "jsonBadRequest", "jsonNotFound",
  "jsonConflict", "jsonGone", "jsonServerError", "jsonServiceUnavailable",
  "jsonTooManyRequests", "jsonBadGateway",
].join("|");

/** Codes passed as the code argument to one of those helpers. */
function codesIn(src: string): string[] {
  const out: string[] = [];
  // `[^;)]` keeps the match inside one call. Allowing any character let an
  // earlier helper call reach forward across a statement boundary and pair with
  // an unrelated string — that is how `"sent"` from a logIssuedDocumentAudit
  // call, and enum members like `"zones"`, were being read as error codes.
  const re = new RegExp(
    "(?:" + ERROR_HELPERS + ")\\(([^;)]{0,300}?),\\s*\"([a-z0-9_]+)\"",
    "g",
  );
  for (const m of src.matchAll(re)) {
    if (m[2]) out.push(m[2]);
  }
  return out;
}

describe("API error codes", () => {
  const files = [
    ...collectRouteFiles(path.join(ROOT, "app", "api")),
    ...collectRouteFiles(path.join(ROOT, "app", "actions")),
  ];

  const emitted = new Map<string, string>();
  for (const f of files) {
    for (const code of codesIn(fs.readFileSync(f, "utf8"))) {
      if (!emitted.has(code)) emitted.set(code, path.relative(ROOT, f));
    }
  }

  const packs = (["he", "en", "ru"] as const).map((locale) => ({
    locale,
    apiErrors: (
      JSON.parse(fs.readFileSync(path.join(ROOT, "messages", `${locale}.json`), "utf8")) as {
        apiErrors?: Record<string, string>;
      }
    ).apiErrors ?? {},
  }));

  it("finds the codes the routes actually emit", () => {
    // A guard on the scanner itself: if the regex stops matching, every other
    // assertion here would pass vacuously.
    expect(emitted.size).toBeGreaterThan(50);
    expect(emitted.has("invalid_body")).toBe(true);
  });

  it("has a translation for every emitted code, in every locale", () => {
    const missing: string[] = [];
    for (const [code, file] of emitted) {
      for (const { locale, apiErrors } of packs) {
        if (!apiErrors[code]) missing.push(`${locale}: ${code}  (${file})`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("keeps placeholders consistent across locales", () => {
    const [he, ...rest] = packs;
    for (const code of Object.keys(he!.apiErrors)) {
      const expected = [...he!.apiErrors[code]!.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
      for (const pack of rest) {
        const actual = [...(pack.apiErrors[code] ?? "").matchAll(/\{(\w+)\}/g)]
          .map((m) => m[1])
          .sort();
        // A locale that drops a placeholder renders "…: " with nothing after it.
        expect({ code, locale: pack.locale, placeholders: actual }).toEqual({
          code,
          locale: pack.locale,
          placeholders: expected,
        });
      }
    }
  });
});
