import { parseModelJsonText } from "@/lib/ai-document-json";
import { runAiChat } from "@/lib/ai-chat";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { boqAgentResponseSchema, type BoqAgentResponse } from "@/lib/boq/boq-agent-schema";

export type BoqAgentLineContext = {
  id: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitPrice: number | null;
  lineTotal: number;
  isWorkDone: boolean;
};

const SYSTEM = `
אתה יועץ כתבי כמויות לפרויקטי בנייה בישראל.
על בסיס שורות BOQ קיימות והנחיית המשתמש, הצע פעולות ממוקדות בלבד.
החזר אובייקט JSON בלבד:
{
  "summary": "סיכום קצר בעברית",
  "suggestions": [
    {
      "action": "add" | "update" | "note",
      "lineId": "מזהה שורה קיים (רק ל-update/note)",
      "description": "תיאור סעיף",
      "unit": "מ\"ר / יח' / מ\"ק ...",
      "quantity": מספר,
      "unitPrice": מספר,
      "rationale": "הסבר קצר"
    }
  ]
}
עד 8 הצעות. אל תמציא מזהי שורה שלא מופיעים ברשימה.
`.trim();

function parseResponse(raw: string): BoqAgentResponse {
  const parsed = parseModelJsonText(raw);
  return boqAgentResponseSchema.parse(parsed);
}

export async function runBoqAgent(input: {
  projectName: string;
  userPrompt: string;
  lines: BoqAgentLineContext[];
  locale?: string;
}): Promise<BoqAgentResponse> {
  if (!isGeminiConfigured()) {
    throw new Error("שירות AI לא מוגדר");
  }

  const payload = {
    project: input.projectName,
    prompt: input.userPrompt,
    lines: input.lines.map((l) => ({
      id: l.id,
      description: l.description,
      unit: l.unit,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineTotal,
      isWorkDone: l.isWorkDone,
    })),
  };

  const { text } = await runAiChat(
    "gemini",
    input.userPrompt,
    `${SYSTEM}\n\nנתוני פרויקט:\n${JSON.stringify(payload)}`,
    input.locale ?? "he",
  );

  return parseResponse(text);
}
