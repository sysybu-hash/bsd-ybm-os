export function parseModelJsonText(text: string): Record<string, unknown> {
  const cleaned = text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Invalid JSON from model");
  return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
}
