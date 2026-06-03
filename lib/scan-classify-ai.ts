/**
 * סיווג מסמך מבוסס-תוכן בעזרת Gemini Flash — שלב 2 באפיון הסריקה.
 *
 * במקום regex על שם הקובץ בלבד, מודול זה שולח את תוכן המסמך ל-Gemini Flash
 * (מהיר וזול) ומקבל חזרה סיווג מדויק יותר עם ביטחון ונימוק.
 *
 * נקרא רק כאשר הסיווג ההיוריסטי חוזר confidence < 0.8.
 * לא מחייב — נכשל בשקט ומחזיר null (ממשיכים עם ההיוריסטיקה).
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "@/lib/env";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { clampScanModeForIndustry } from "@/lib/scan-modes-for-ui";
import { createLogger } from "@/lib/logger";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { ScanClassification } from "@/lib/scan-classify";

const log = createLogger("scan-classify-ai");

/** מודל Flash קל לסיווג בלבד — לא צריך Pro */
const CLASSIFY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash";

const SCAN_MODES: ScanModeV5[] = [
  "INVOICE_FINANCIAL",
  "DRAWING_BOQ",
  "QUOTE_BOQ",
  "PROGRESS_BILL",
  "SITE_LOG",
  "GENERAL_DOCUMENT",
];

const CLASSIFY_PROMPT = `You are a document classifier for an Israeli business management system.

Look at this document and classify it. Return ONLY a JSON object (no markdown):
{
  "scanMode": one of: "INVOICE_FINANCIAL" | "DRAWING_BOQ" | "QUOTE_BOQ" | "PROGRESS_BILL" | "SITE_LOG" | "GENERAL_DOCUMENT",
  "confidence": number between 0 and 1,
  "rationale": short explanation in English (max 80 chars),
  "docTypeDetail": specific type within the category (e.g. "tax invoice", "delivery note", "progress certificate")
}

Classification guide:
- INVOICE_FINANCIAL: invoices (חשבונית), receipts (קבלה), tax docs, bills, delivery orders with prices
- DRAWING_BOQ: construction drawings, BOQ (כתב כמויות), quantity survey sheets, architect plans
- QUOTE_BOQ: contractor quotes (הצעת מחיר), price lists, tender documents
- PROGRESS_BILL: interim payment certificates (חשבון התקדמות/חלקי), progress claims
- SITE_LOG: daily site reports (יומן עבודה/שטח), inspection reports, daily diaries
- GENERAL_DOCUMENT: contracts, agreements, letters, anything that doesn't fit above

Be decisive. If it clearly looks like an invoice, confidence should be 0.90+.`;

/**
 * מסווג מסמך לפי תוכנו (לא רק שם קובץ).
 * מחזיר null אם Gemini לא מוגדר או נכשל — במקרה זה ממשיכים עם ההיוריסטיקה.
 */
export async function classifyScanDocumentByContent(params: {
  base64: string;
  mimeType: string;
  industry?: string | null;
  /** timeout in ms — default 8000 */
  timeoutMs?: number;
}): Promise<ScanClassification | null> {
  const { base64, mimeType, industry, timeoutMs = 8000 } = params;

  const apiKey = env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey?.trim()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    let raw: Record<string, unknown> | null = null;
    for (const modelId of [CLASSIFY_MODEL, FALLBACK_MODEL]) {
      try {
        const model = genAI.getGenerativeModel({ model: modelId });
        const result = await model.generateContent([
          CLASSIFY_PROMPT,
          { inlineData: { data: base64, mimeType } },
        ]);
        raw = parseModelJsonText(result.response.text()) as Record<string, unknown>;
        break;
      } catch (err) {
        // model unavailable → try fallback
        if (
          err instanceof Error &&
          (err.message.includes("404") || err.message.includes("not found"))
        ) {
          continue;
        }
        throw err;
      }
    }

    if (!raw || typeof raw !== "object") return null;

    const scanModeRaw = String(raw.scanMode ?? "");
    const scanMode: ScanModeV5 = SCAN_MODES.includes(scanModeRaw as ScanModeV5)
      ? (scanModeRaw as ScanModeV5)
      : "GENERAL_DOCUMENT";

    const confidence = Math.min(1, Math.max(0, Number(raw.confidence) || 0));
    const rationale = typeof raw.rationale === "string" ? raw.rationale : "ai-classified";
    const docTypeDetail =
      typeof raw.docTypeDetail === "string" ? raw.docTypeDetail : undefined;

    const clamped = clampScanModeForIndustry(scanMode, industry ?? null);

    return {
      scanMode: clamped,
      confidence,
      rationale: `ai-content: ${rationale}${clamped !== scanMode ? " (clamped)" : ""}`,
      labels: ["ai_classified", scanMode.toLowerCase(), ...(docTypeDetail ? [docTypeDetail] : [])],
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      log.warn("content classification timed out", { mimeType });
    } else {
      log.warn("content classification failed", {
        error: err instanceof Error ? err.message : String(err),
        mimeType,
      });
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
