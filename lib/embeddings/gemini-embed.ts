import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("gemini-embed");

/** GA אפריל 2026 — מחליף text-embedding-004 (כבוי 14/01/2026) */
export const GEMINI_EMBEDDING_MODEL = "gemini-embedding-2";

/** gemini-embedding-2 MRL — תואם לעמודות pgvector הקיימות */
export const EMBEDDING_OUTPUT_DIM = 768;

export function isEmbeddingConfigured(): boolean {
  return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim());
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text: trimmed }] },
        output_dimensionality: EMBEDDING_OUTPUT_DIM,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      log.warn("embed_failed", { status: res.status, error: body.slice(0, 240) });
      return null;
    }
    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!values?.length) return null;
    return values;
  } catch (err: unknown) {
    log.warn("embed_failed", { error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}
