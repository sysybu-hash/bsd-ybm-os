import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import { isGeminiConfigured } from "@/lib/ai-providers";

export type ChatAttachment = {
  data: string;
  mimeType: string;
};

export async function chatWithAttachment(
  prompt: string,
  attachment: ChatAttachment,
): Promise<string> {
  if (!isGeminiConfigured()) {
    throw new Error("חסר מפתח Gemini לניתוח קבצים מצורפים");
  }

  const genAI = new GoogleGenerativeAI(
    env.GOOGLE_GENERATIVE_AI_API_KEY || env.GEMINI_API_KEY || "",
  );

  let lastErr: unknown = null;
  for (const modelName of getGeminiModelFallbackChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        prompt,
        { inlineData: { data: attachment.data, mimeType: attachment.mimeType } },
      ]);
      return result.response.text();
    } catch (e) {
      lastErr = e;
      if (isLikelyGeminiModelUnavailable(e)) continue;
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error("Gemini vision: כל המודלים נכשלו");
}
