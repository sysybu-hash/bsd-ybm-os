import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import type { AiProviderId } from "@/lib/ai-providers";

/** ספקים שתומכים בסריקת מסמך (כולל Google Document AI כספק פרימיום) */
const DOCUMENT_SCAN_PROVIDERS: AiProviderId[] = ["gemini", "openai", "anthropic", "docai"];

/** מנועים מותרים לפי רמת מנוי — פרימיום (OpenAI, Anthropic, DocAI) רק למנוי חברה ומעלה */
export function getAllowedAiProvidersForPlan(
  subscriptionTier: string,
  elevated: boolean,
): AiProviderId[] {
  // אדמין פלטפורמה תמיד מקבל הכל
  if (elevated) return [...DOCUMENT_SCAN_PROVIDERS];
  
  const normalized = (subscriptionTier || "FREE").trim().toUpperCase();
  
  // מנויי חברה ותאגיד מקבלים הכל
  if (normalized === "COMPANY" || normalized === "CORPORATE") {
    return [...DOCUMENT_SCAN_PROVIDERS];
  }

  // שאר המנויים (FREE, HOUSEHOLD, DEALER) מוגבלים ל־Gemini בלבד
  return ["gemini"];
}

/**
 * תשובת טקסט קצרה מ־Gemini — לניתוחי ERP / השוואות מחיר.
 * ללא מפתח — מחזיר הודעת גיבוי ללא זריקת שגיאה.
 */
export async function generateAiResponse(prompt: string): Promise<string> {
  const apiKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    return "מומלץ לעקוב אחר מגמת המחיר מול ספקים חלופיים ולוודא שההזמנה עומדת בתקציב.";
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const wrapped = `ענה בעברית בלבד, בפסקה אחת קצרה (עד 4 משפטים), בלי כותרות:\n\n${prompt}`;
    let lastErr: unknown = null;
    for (const modelName of getGeminiModelFallbackChain()) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(wrapped);
        const text = result.response.text()?.trim();
        if (text && text.length > 0) return text;
      } catch (e) {
        lastErr = e;
        if (isLikelyGeminiModelUnavailable(e)) continue;
        break;
      }
    }
    void lastErr;
    return "לא התקבלה תשובה מהמודל — נסו שוב מאוחר יותר.";
  } catch {
    return "ניתוח AI זמנית לא זמין. השוו מחירים ידנית מול היסטוריית הרכישות.";
  }
}
