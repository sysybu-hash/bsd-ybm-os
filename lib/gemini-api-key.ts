import { env } from "@/lib/env";
/** מפתח Gemini — מקור יחיד לכל השרת (לעולם לא NEXT_PUBLIC). */
export function getGeminiApiKey(): string {
  return (
    env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    env.GEMINI_API_KEY?.trim() ||
    ""
  );
}

export function hasGeminiApiKey(): boolean {
  return getGeminiApiKey().length > 0;
}
