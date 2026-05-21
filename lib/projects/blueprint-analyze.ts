import { parseModelJsonText } from "@/lib/ai-document-json";
import { isOpenAiConfigured } from "@/lib/ai-providers";
import { runAiChat } from "@/lib/ai-chat";
import { getBlueprintAnalysisModelChain } from "@/lib/gemini-model";
import { geminiMultimodal } from "@/lib/tri-engine-extract";
import {
  parseBlueprintAnalysis,
  type BlueprintAnalysis,
} from "@/lib/projects/blueprint-analysis-schema";

const BLUEPRINT_INSTRUCTION = `
אתה מהנדס ביצוע ומפתח כמויות מומחה. נתח את מסמך הביצוע / הגרמושקה המצורפת.
הפק כתב כמויות, משימות ללוח זמנים (גנט) ושלבי תשלום מומלצים (חשבונות חלקיים).
החזר אך ורק אובייקט JSON תקין בפורמט:
{
  "tasks": [{ "name": "שם משימה", "startDate": "ISO-8601 אופציונלי", "endDate": "ISO-8601 אופציונלי" }],
  "milestones": [{ "name": "תיאור שלב תשלום", "amount": מספר }],
  "boqLineItems": [{ "description": "תיאור סעיף", "unit": "מ\"ר", "quantity": מספר, "note": "הערה", "confidence": 0.0-1.0 }],
  "requiresReview": true
}
ללא טקסט נוסף מחוץ ל-JSON.
`.trim();

function parseRawBlueprint(raw: unknown): BlueprintAnalysis {
  if (typeof raw === "object" && raw !== null) {
    return parseBlueprintAnalysis(raw as Record<string, unknown>);
  }
  return parseBlueprintAnalysis(parseModelJsonText(String(raw)));
}

async function openAiBlueprintRepair(rawSnippet: string): Promise<BlueprintAnalysis | null> {
  if (!isOpenAiConfigured()) return null;
  try {
    const { text } = await runAiChat(
      "openai",
      `תקן את הפלט הבא ל-JSON תקין בלבד לפי סכמת blueprint (tasks, milestones):\n${rawSnippet.slice(0, 12000)}`,
      BLUEPRINT_INSTRUCTION,
      "he",
    );
    return parseBlueprintAnalysis(parseModelJsonText(text));
  } catch {
    return null;
  }
}

export async function analyzeBlueprintFile(
  base64: string,
  mimeType: string,
): Promise<BlueprintAnalysis> {
  const modelChain = getBlueprintAnalysisModelChain();
  const raw = await geminiMultimodal(base64, mimeType, BLUEPRINT_INSTRUCTION, modelChain);

  try {
    return parseRawBlueprint(raw);
  } catch {
    const repaired = await openAiBlueprintRepair(
      typeof raw === "object" ? JSON.stringify(raw) : String(raw),
    );
    if (repaired) return repaired;
    throw new Error("פענוח הגרמושקה נכשל");
  }
}
