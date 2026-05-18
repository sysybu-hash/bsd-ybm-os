import type { UIMessage } from "ai";

/** טקסט גלוי בלבד — ללא חלקי reasoning מה-AI SDK. */
export function visibleTextFromUIMessage(m: UIMessage): string {
  if (!m.parts?.length) return "";
  return m.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
}
