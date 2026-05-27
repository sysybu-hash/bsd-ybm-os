import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { DocumentAnalysis } from "./types";

export const SCAN_INSTRUCTION_KEY = "bsd_scan_user_instruction";

export const ENGINE_MODES: { id: TriEngineRunMode; labelKey: string; fallback: string }[] = [
  { id: "AUTO", labelKey: "scanner.modeAuto", fallback: "אוטומטי" },
  { id: "MULTI_PARALLEL", labelKey: "scanner.modeMulti", fallback: "ריבוי מנועים" },
  { id: "SINGLE_GEMINI", labelKey: "scanner.modeGemini", fallback: "Gemini" },
  { id: "SINGLE_OPENAI", labelKey: "scanner.modeOpenai", fallback: "OpenAI" },
  { id: "SINGLE_DOCUMENT_AI", labelKey: "scanner.modeDocAi", fallback: "Document AI" },
];

export function formatMsg(
  template: string,
  vars: Record<string, string | number>,
): string {
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v)),
    template,
  );
}

export function mapV5ToAnalysis(
  v5: ScanExtractionV5,
  aiData?: Record<string, unknown>,
): DocumentAnalysis {
  const meta = v5.documentMetadata;
  return {
    amount: Number(v5.total ?? 0),
    vendor: v5.vendor || "לא צוין",
    taxId: v5.taxId ?? undefined,
    projectSuggestion: meta?.project ?? meta?.client ?? "",
    confidence: 0.92,
    summary: v5.summary || v5.docType,
    date: v5.date ?? meta?.documentDate ?? new Date().toISOString().split("T")[0],
    rawAiData: aiData ?? (v5 as unknown as Record<string, unknown>),
    v5,
  };
}

export async function readNdjsonStream(
  res: Response,
  onLine: (obj: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body");
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    if (signal?.aborted) {
      await reader.cancel().catch(() => undefined);
      throw new DOMException("Scan aborted", "AbortError");
    }
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      try {
        onLine(JSON.parse(t) as Record<string, unknown>);
      } catch {
        /* skip malformed */
      }
    }
  }
  const tail = buf.trim();
  if (tail) {
    try {
      onLine(JSON.parse(tail) as Record<string, unknown>);
    } catch {
      /* */
    }
  }
}
