import { getAssistantNowDisplayHe, withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import {
  LOCALE_AI_LANGUAGE_NAMES,
  normalizeLocale,
  type AppLocale,
} from "./config";

/** גרסת סכימת JSON — חייב לזהות עם DocumentScanCache.schemaVersion */
export const DOCUMENT_JSON_SCHEMA_VERSION = 4;

export function getDocumentJsonInstruction(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";
  const nowHe = getAssistantNowDisplayHe();
  return `You are a Senior Construction Engineer & Quantity Surveyor (כמי"ס) analyzing documents for BSD-YBM (Israeli construction: sites, civil, MEP, finishes).
Server reference date/time (for interpreting "today" in user questions, not document dates): ${nowHe}.

MISSION:
- Scan ALL pages/sheets of the document (every viewport, sheet index, and continuation).
- Prioritize technical data from the Legend (מקרא), drawing titles, notes, schedules, and blueprint annotations.
- Extract quantities, materials, dimensions, levels, grids, and MEP penetration / fixture callouts where visible.

Return ONLY one JSON object (no markdown, no code fences) with this STRICT shape:

{
  "metadata": {
    "project": string | null,
    "client": string | null,
    "documentDate": string | null,
    "drawingRefs": string[] | null,
    "discipline": string | null,
    "sheetIndex": string | null
  },
  "billOfQuantities": Array<{
    "itemRef": string | null,
    "description": string,
    "material": string | null,
    "dimensions": string | null,
    "mepPoints": string[] | null,
    "quantity": number | null,
    "unit": string | null,
    "notes": string | null
  }>,
  "vendor": string,
  "total": number,
  "date": string,
  "docType": string,
  "summary": string,
  "lineItems": Array<{
    "description": string,
    "quantity"?: number,
    "unitPrice"?: number,
    "lineTotal"?: number,
    "sku"?: string
  }>
}

RULES:
- "metadata" and "billOfQuantities" are the primary engineering output; populate them as richly as the source allows.
- BOQ normalization for ERP / price alerts: every row MUST use a standardized "unit" when quantity is known — prefer m, m², m³, יח׳ (or "units"), kg, t, h, day. If the drawing states a length/area in free text (e.g. "קיר 15 מ׳", "קיר 3×2.5 מ׳"), convert to numeric "quantity" with the correct SI-style unit and keep the raw phrase in "dimensions" or "description".
- For financial invoices/receipts, still fill "lineItems" from line rows; for drawings/schedules, derive "lineItems" by mapping each "billOfQuantities" row to description + quantity + unit (unitPrice/lineTotal 0 or null if unknown).
- "vendor": use client, contractor, or primary supplier name from title block — else "לא צוין".
- "total": numeric sum of priced lines if applicable; else 0.
- "summary": one concise paragraph in ${lang} describing scope (discipline + main quantities).
- All human-readable strings (metadata fields, billOfQuantities descriptions, vendor, docType, summary, lineItems descriptions) MUST be in ${lang}.
- If a field is unknown, use null (or [] for arrays), not empty strings in object slots that expect null.
`;
}

export function getAiChatSystemPrefix(contextJson: string, locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";
  const core = `You are the BSD-YBM assistant for Israeli construction-sector organizations (contracting, sites, and allied trades such as electrical, plumbing, HVAC, finishing). Use the context JSON (industry, constructionTrade, documents). Answer clearly and concisely in ${lang}. When time or "today" matters, use the current date from the temporal block above. Context (JSON):\n${contextJson.slice(0, 100_000)}\n\nQuestion:\n`;
  return withAssistantTemporalContext(core);
}
