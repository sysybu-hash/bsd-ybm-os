import type { MessageTree } from "./keys";
import en from "@/messages/en.json";

function getNested(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : undefined;
}

export function createTranslator(messages: MessageTree) {
  return function t(key: string, vars?: Record<string, string>): string {
    let s =
      getNested(messages as unknown as object, key) ??
      getNested(en as unknown as object, key) ??
      key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{${k}}`).join(v);
      }
    }
    return s;
  };
}

export type TFunction = ReturnType<typeof createTranslator>;
