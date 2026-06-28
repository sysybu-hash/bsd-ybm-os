import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";

/** מודלי Flash נתמכים ב-Gemini API — ללא 1.5-flash-002 (מחזיר 404 אצל רוב המפתחות) */
export const GEMINI_FLASH_PREFERRED = [
  "gemini-3.5-flash",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

export async function geminiMultimodal(
  base64: string,
  mimeType: string,
  instruction: string,
  modelChain: readonly string[],
): Promise<Record<string, unknown>> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error("חסר מפתח Gemini");
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;
  for (const modelId of modelChain) {
    try {
      const model = genAI.getGenerativeModel(
        { model: modelId },
        { apiVersion: undefined },
      );
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${instruction}\nReturn a single JSON object only, no markdown.` },
              { inlineData: { data: base64, mimeType } },
            ],
          },
        ],
        generationConfig: { temperature: 0, responseMimeType: "application/json" },
      });
      return parseModelJsonText(result.response.text());
    } catch (err: unknown) {
      lastErr = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
