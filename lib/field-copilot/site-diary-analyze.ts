import { GoogleGenerativeAI } from "@google/generative-ai";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { env } from "@/lib/env";
import { GEMINI_MODEL_FALLBACK_TIER, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import {
  siteDiaryAnalysisSchema,
  type SiteDiaryAnalysis,
} from "@/lib/validation/schemas/site-diary-report";

const log = createLogger("site-diary-analyze");

export type SiteDiaryAnalyzeInput = {
  localeLang: string;
  projectName?: string | null;
  taskTitle?: string | null;
  notes?: string | null;
  image: { base64: string; mimeType: string };
};

function buildSiteDiaryPrompt(input: SiteDiaryAnalyzeInput): string {
  const context = [
    `Language for summary: ${input.localeLang}`,
    input.projectName ? `Project: ${input.projectName}` : null,
    input.taskTitle ? `Linked task: ${input.taskTitle}` : null,
    input.notes ? `Worker notes: ${input.notes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `You are a construction field supervisor assistant analyzing a site photo for a daily work log.

${context}

Inspect the photo for: materials delivered (e.g. rebar, concrete), visible damage or safety issues, work progress, blockers, weather clues.

Return ONE JSON object only (no markdown):
{
  "summary": "2-4 sentences in the requested language — factual work diary entry",
  "progressPercent": 0-100 or null,
  "materialsDetected": ["short items"],
  "issues": ["damage, delays, safety — empty if none"],
  "suggestedTaskStatus": "todo" | "in-progress" | "review" | "done" | null,
  "weather": "brief or null"
}

Rules:
- summary must be in ${input.localeLang}
- suggestedTaskStatus only when clearly justified from the image
- be conservative on issues — only report what is visible`;
}

export function parseSiteDiaryAnalysis(raw: unknown): SiteDiaryAnalysis {
  const parsed = siteDiaryAnalysisSchema.safeParse(raw);
  if (parsed.success) return parsed.data;

  if (raw && typeof raw === "object" && "summary" in raw && typeof raw.summary === "string") {
    return siteDiaryAnalysisSchema.parse({
      summary: raw.summary,
      materialsDetected: [],
      issues: [],
    });
  }

  throw new Error("Invalid site diary analysis shape");
}

export async function analyzeSiteDiaryPhoto(
  input: SiteDiaryAnalyzeInput,
): Promise<SiteDiaryAnalysis> {
  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey?.trim()) throw new Error("חסר מפתח Gemini");

  const prompt = buildSiteDiaryPrompt(input);
  const parts = [
    { text: prompt },
    { inlineData: { data: input.image.base64, mimeType: input.image.mimeType } },
  ] as const;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastErr: unknown = null;

  for (const modelId of GEMINI_MODEL_FALLBACK_TIER) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([...parts]);
      const raw = parseModelJsonText(result.response.text());
      return parseSiteDiaryAnalysis(raw);
    } catch (err: unknown) {
      lastErr = err;
      log.warn("site diary analyze attempt failed", {
        modelId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("ניתוח תמונת אתר נכשל");
}
