import type { MessageTree } from "./keys";

function getNested(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

/**
 * Missing keys fall through to the key itself, not to English.
 *
 * This used to `import en from "@/messages/en.json"` as a fallback, which put
 * the entire English pack into every client bundle that renders a translator —
 * measured at 222KB on the marketing landing page, the largest asset there, on a
 * page that renders in Hebrew.
 *
 * The fallback could never fire: `npm run i18n:parity` requires 100% key parity
 * across every pack and blocks CI (quality-gate.yml) and `npm run verify`, so a
 * key present in one locale is present in all of them. Returning the key also
 * matches what callers already expect — several sites test `value === key` to
 * detect a missing provider.
 */
export function createTranslator(messages: MessageTree) {
  return function t(key: string, vars?: Record<string, string>): string {
    let s = getNested(messages as unknown as object, key) ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{${k}}`).join(v);
      }
    }
    return s;
  };
}

export type TFunction = ReturnType<typeof createTranslator>;
