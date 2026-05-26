import type { MessageTree } from "@/lib/i18n/keys";
import { getMergedIndustryConfig } from "@/lib/construction-trades";
import {
  LOCALE_AI_LANGUAGE_NAMES,
  normalizeLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import { buildV5JsonInstruction } from "@/lib/scan-schema-v5";

export function buildFieldCopilotInstruction(input: {
  localeLang: string;
  industry: string;
  trade: string | null;
  messages: MessageTree;
  transcript?: string | null;
  userNotes?: string | null;
  projectName?: string | null;
  clientName?: string | null;
}): string {
  const cfg = getMergedIndustryConfig(input.industry, input.trade, input.messages);
  const v5 = buildV5JsonInstruction(input.localeLang, "QUOTE_BOQ", input.industry);

  const contextLines = [
    `### FIELD SITE CONTEXT`,
    `Trade / industry: ${cfg.label}`,
    cfg.aiInstructions,
    input.projectName ? `Project: ${input.projectName}` : null,
    input.clientName ? `Client: ${input.clientName}` : null,
    input.transcript?.trim() ? `Contractor voice description:\n${input.transcript.trim().slice(0, 4000)}` : null,
    input.userNotes?.trim() ? `Contractor notes:\n${input.userNotes.trim().slice(0, 2000)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return `${v5}

${contextLines}

### FIELD COPILOT RULES
- You analyze photos/video keyframes + voice transcript from a construction site visit.
- Ground every quantity and scope line in visible evidence (photos) or the contractor transcript/notes — do not invent rooms, dimensions, or prices.
- If something is unclear, omit it from BOQ/lineItems and list it under "assumptions" instead of guessing.
- Populate "billOfQuantities" with measurable work items (description, quantity, unit).
- Populate "lineItems" for priced proposal rows — set unitPrice to 0 and lineTotal to 0 (contractor fills prices manually).
- Set "priceAlertPending": true always (manual pricing required).
- Add a concise "summary" scope description in ${input.localeLang}.
- Also return a root-level JSON array field "assumptions" (3–8 strings) listing uncertainties or items needing site verification.
- docType should be "QUOTE" or "BOQ" as appropriate.
- Human-readable strings in ${input.localeLang}.`;
}

/** הנחיית Gemini Live לשלב הקלטה קולית — לפי שפת הממשק */
export function getFieldCopilotLivePrompt(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc];
  if (loc === "en") {
    return `You assist a contractor on site. Prompt them to describe required work: scope, materials, location, site issues. Speak in clear, short ${lang}. Do not invent facts — only clarify what they report.`;
  }
  if (loc === "ru") {
    return `Вы помогаете прорабу на объекте. Попросите описать требуемые работы: объём, материалы, место, проблемы на площадке. Говорите кратко и ясно на ${lang}. Не выдумывайте факты — только уточняйте то, что сообщает пользователь.`;
  }
  return `אתה עוזר לקבלן בשטח. הזמן אותו לתאר את העבודה הנדרשת: היקף, חומרים, מיקום, בעיות באתר. דבר ב${lang} קצרה וברורה. אל תמציא עובדות — רק הבהר מה שהמשתמש מדווח.`;
}

/** @deprecated השתמשו ב-getFieldCopilotLivePrompt(locale) */
export const FIELD_COPILOT_LIVE_PROMPT = getFieldCopilotLivePrompt("he");
