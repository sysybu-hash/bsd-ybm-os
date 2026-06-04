import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger("gemini-embed");
const MODEL = "text-embedding-004";

export function isEmbeddingConfigured(): boolean {
  return Boolean(env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim());
}

export async function embedText(text: string): Promise<number[] | null> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() || env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) return null;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: MODEL });
    const result = await model.embedContent(trimmed);
    const values = result.embedding?.values;
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
