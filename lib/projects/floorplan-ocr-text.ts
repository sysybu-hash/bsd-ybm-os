import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import {
  getOpenAiChatVisionModelCandidates,
  getOpenAiResponsesModelCandidates,
  isGeminiConfigured,
  isOpenAiConfigured,
  isOpenAiEligibleForModelFallback,
} from "@/lib/ai-providers";
import {
  deterministicGenerationConfig,
  getBlueprintAnalysisModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import { FLOORPLAN_PHOTO_OCR_RULES } from "@/lib/projects/floorplan-photo-instructions";
import { recordAiUsage, usageFromGemini, usageFromOpenAi } from "@/lib/ai-usage";

export const FLOORPLAN_OCR_TEXT_INSTRUCTION = `
Extract every printed character from this Israeli apartment floor plan (גרמושקה / תוכנית מכר).
Copy Hebrew labels exactly as printed (ח. מגורים, מטבח, ממ"ד, ח. שינה, מרפסת, דירה, קומה, שטח, מדרגות, מדרגות פנים, אמבטיה, שירותים, חדר כביסה, ח.עבודה, חדר עבודה, מחסן, ח.שרות).
Copy all dimension numbers (3.20, 3,20, 385, 103.29 מ"ר).
Copy elevation markers exactly (±0.00, +1.26, +8.06, +9.64, -0.10, −0.05).
Return plain UTF-8 text only. No JSON. No translation. No commentary.
`.trim();

export { FLOORPLAN_PHOTO_OCR_RULES };

export function floorplanOcrTextInstruction(photo = false): string {
  return photo ? `${FLOORPLAN_OCR_TEXT_INSTRUCTION}\n\n${FLOORPLAN_PHOTO_OCR_RULES}` : FLOORPLAN_OCR_TEXT_INSTRUCTION;
}

function extractTextFromOpenAiResponsesPayload(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  if (typeof d.output_text === "string" && d.output_text.trim()) return d.output_text;
  const output = d.output;
  if (!Array.isArray(output)) return "";
  for (const block of output) {
    if (!block || typeof block !== "object") continue;
    const content = (block as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      const text = (part as { text?: unknown }).text;
      if (typeof text === "string" && text.trim()) return text;
    }
  }
  return "";
}

/** One model call. A stuck request used to hold the function until Vercel killed it at 300s. */
const OCR_MS = 40_000;

function failAfter(ms: number, label: string): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} חרג מ-${Math.round(ms / 1000)} שניות`)), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

async function extractPrintedTextWithGemini(base64: string, mimeType: string, instruction: string): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) throw new Error("חסר מפתח Gemini");
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;
  for (const modelId of getBlueprintAnalysisModelChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const limit = failAfter(OCR_MS, `Gemini OCR (${modelId})`);
      let result;
      try {
        result = await Promise.race([
          model.generateContent({
            contents: [
              {
                role: "user",
                parts: [
                  { text: instruction },
                  { inlineData: { data: base64, mimeType } },
                ],
              },
            ],
            generationConfig: deterministicGenerationConfig(),
          }),
          limit.promise,
        ]);
      } finally {
        limit.cancel();
      }
      recordAiUsage(model.model, usageFromGemini(result));
      const text = result.response.text().trim();
      if (text) return text;
      lastErr = new Error(`Gemini OCR (${modelId}) החזיר ריק`);
    } catch (err: unknown) {
      lastErr = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

async function extractPrintedTextWithOpenAI(base64: string, mimeType: string, instruction: string): Promise<string> {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) throw new Error("חסר OPENAI_API_KEY");

  if (mimeType === "application/pdf") {
    const models = getOpenAiResponsesModelCandidates(undefined);
    let lastErr: Error | null = null;
    for (const model of models) {
      const res = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        signal: AbortSignal.timeout(OCR_MS),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          // gpt-5.x reasoning models reject both: "Unsupported parameter:
          // 'temperature'" and "Unknown parameter: 'seed'". Determinism on this
          // path comes from the instruction, not from decoding knobs.
          input: [
            {
              role: "user",
              content: [
                {
                  type: "input_file",
                  filename: "floorplan.pdf",
                  file_data: `data:application/pdf;base64,${base64}`,
                },
                { type: "input_text", text: instruction },
              ],
            },
          ],
        }),
      });
      const raw = await res.text().catch(() => res.statusText);
      if (!res.ok) {
        lastErr = new Error(`OpenAI OCR: ${res.status} ${raw.slice(0, 400)}`);
        if (isOpenAiEligibleForModelFallback(res.status, raw)) continue;
        throw lastErr;
      }
      const payload = JSON.parse(raw) as unknown;
      recordAiUsage(model, usageFromOpenAi(payload));
      const text = extractTextFromOpenAiResponsesPayload(payload).trim();
      if (text) return text;
      lastErr = new Error("OpenAI OCR החזיר ריק");
    }
    throw lastErr ?? new Error("OpenAI OCR נכשל");
  }

  const models = getOpenAiChatVisionModelCandidates(undefined);
  const dataUrl = `data:${mimeType};base64,${base64}`;
  let lastErr: Error | null = null;
  for (const model of models) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: instruction },
              { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
            ],
          },
        ],
      }),
    });
    const raw = await res.text().catch(() => res.statusText);
    if (!res.ok) {
      lastErr = new Error(`OpenAI OCR: ${res.status} ${raw.slice(0, 400)}`);
      if (isOpenAiEligibleForModelFallback(res.status, raw)) continue;
      throw lastErr;
    }
    const data = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> };
    recordAiUsage(model, usageFromOpenAi(data));
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";
    if (text) return text;
    lastErr = new Error("OpenAI OCR החזיר ריק");
  }
  throw lastErr ?? new Error("OpenAI OCR נכשל");
}

/**
 * OCR טקסט מודפס — Gemini/OpenAI כש-Document AI / Mistral לא זמינים.
 * `first`: only the first engine is started — a lean read waits on one, and
 * a second started beside it was paid for and never read.
 */
export function floorplanLlmOcrJobs(
  base64: string,
  mimeType: string,
  photo = false,
  options?: { first?: boolean },
): Array<Promise<{ engine: string; text: string }>> {
  const instruction = floorplanOcrTextInstruction(photo);
  const starts: Array<() => Promise<{ engine: string; text: string }>> = [];
  if (isGeminiConfigured()) {
    starts.push(() => extractPrintedTextWithGemini(base64, mimeType, instruction).then((text) => ({ engine: "gemini-ocr", text })));
  }
  if (isOpenAiConfigured()) {
    starts.push(() => extractPrintedTextWithOpenAI(base64, mimeType, instruction).then((text) => ({ engine: "openai-ocr", text })));
  }
  return (options?.first ? starts.slice(0, 1) : starts).map((start) => start());
}
