import { GoogleGenerativeAI, type Content, type Part } from "@google/generative-ai";
import { isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";

/** מודל לצ'אט מחברת פרויקטים — ברירת מחדל: Gemini 3.1 Pro Stable (ניתן לעקוף ב־GEMINI_NOTEBOOK_MODEL). */
const NOTEBOOK_DEFAULT_MODEL = "gemini-2.5-flash-lite";
const NOTEBOOK_FALLBACK_MODELS = [
  NOTEBOOK_DEFAULT_MODEL,
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.5-flash",
] as const;

function dedupeModels(models: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const model of models) {
    const trimmed = model.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function getNotebookModelChain(): string[] {
  return dedupeModels([
    process.env.GEMINI_NOTEBOOK_MODEL?.trim() || NOTEBOOK_DEFAULT_MODEL,
    ...NOTEBOOK_FALLBACK_MODELS,
  ]);
}

function getGeminiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
}

export type NotebookChatMessage = { role: "user" | "model"; content: string };

export type NotebookPdfPart = {
  fileName: string;
  base64: string;
  mimeType: string;
};

export type NotebookSourcePart = NotebookPdfPart & {
  text?: string;
};

const SYSTEM_NOTEBOOK_BASE = `You are an expert construction and civil engineering assistant embedded in an ERP.
The user attaches project PDFs (specifications, drawings, bills of quantities, standards, RFIs, submittals).

Rules:
- Ground answers in the attached PDFs whenever possible. If the PDFs do not contain the answer, say clearly that it is not in the sources.
- When you infer a requirement, cite what you can (e.g. drawing sheet, section title, table heading, or approximate page if obvious from structure).
- For engineering requirements, prefer structured answers: bullet lists, numbered steps, materials, grades, dimensions, tolerances, codes/standards referenced, and acceptance criteria.
- If documents conflict, point out the conflict and quote or paraphrase both sides briefly.
- When bill-of-quantities (BOQ) JSON from the organization's recent scans is provided, use it as supplementary structured context; if it conflicts with a PDF, prefer the PDF for that detail and note the discrepancy.
- Site Logs (יומן עבודה): You can generate professional site logs based on the current date, weather (infer if possible), and activities. 
- Digital Signatures: When providing a document that needs signing, use the placeholder [SIGNATURE_REQUIRED] and mention the recipient should sign using the system signature tool.
- Respond in the same language as the user's latest message (Hebrew or English).`;

function buildSystemInstruction(billOfQuantitiesContext: string | null | undefined): string {
  const trimmed = billOfQuantitiesContext?.trim();
  if (!trimmed) return SYSTEM_NOTEBOOK_BASE;
  return `${SYSTEM_NOTEBOOK_BASE}

--- Recent ERP scan — billOfQuantities excerpts (JSON, may be partial) ---
${trimmed.slice(0, 48_000)}`;
}

function buildSourceIntro(sources: NotebookSourcePart[]): string {
  if (!sources.length) return "";
  return `\n\nAttached source inventory:\n${sources
    .map((source, index) => `${index + 1}. ${source.fileName} (${source.mimeType})`)
    .join("\n")}`;
}

function sourceToParts(source: NotebookSourcePart): Part[] {
  if (source.text?.trim()) {
    return [{ text: `Source: ${source.fileName}\n\n${source.text.slice(0, 80_000)}` }];
  }
  return [{
    inlineData: {
      mimeType: source.mimeType || "application/pdf",
      data: source.base64,
    },
  }];
}

function buildHistoryWithSourcesInFirstTurn(
  prior: NotebookChatMessage[],
  sources: NotebookSourcePart[],
): Content[] {
  const history: Content[] = [];
  for (let i = 0; i < prior.length; i++) {
    const m = prior[i];
    if (m.role === "user" && i === 0 && sources.length > 0) {
      history.push({
        role: "user",
        parts: [
          ...sources.flatMap(sourceToParts),
          { text: `${m.content}${buildSourceIntro(sources)}` },
        ],
      });
    } else {
      history.push({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      });
    }
  }
  return history;
}

/**
 * מריץ סבב צ'אט אחד מול Gemini עם היסטוריה + PDFs בצעד המשתמש הראשון.
 * הלקוח שולח מחדש את ה-PDFs בכל בקשה כדי לאחסן state בשרת.
 */
export async function runErpProjectNotebookChat(params: {
  messages: NotebookChatMessage[];
  pdfs?: NotebookPdfPart[];
  sources?: NotebookSourcePart[];
  /** הקשר כמותי מהמסמכים הסרוקים בארגון */
  billOfQuantitiesContext?: string | null;
}): Promise<{ text: string; model: string }> {
  const key = getGeminiKey()?.trim();
  if (!key) {
    throw new Error("חסר GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY");
  }

  const { messages, billOfQuantitiesContext } = params;
  const sources: NotebookSourcePart[] = params.sources ?? params.pdfs ?? [];
  if (!messages.length) {
    throw new Error("חסרות הודעות");
  }
  const last = messages[messages.length - 1];
  if (last.role !== "user") {
    throw new Error("ההודעה האחרונה חייבת להיות מהמשתמש");
  }
  if (!last.content?.trim()) {
    throw new Error("תוכן ההודעה ריק");
  }

  const prior = messages.slice(0, -1);
  const history = buildHistoryWithSourcesInFirstTurn(prior, sources);
  const genAI = new GoogleGenerativeAI(key);
  let lastError: unknown = null;

  for (const modelId of getNotebookModelChain()) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelId,
        systemInstruction: buildSystemInstruction(billOfQuantitiesContext),
      });
      const chat = model.startChat({ history });

      if (prior.length === 0 && sources.length > 0) {
        const parts: Part[] = [
          ...sources.flatMap(sourceToParts),
          { text: `${last.content.trim()}${buildSourceIntro(sources)}` },
        ];
        const result = await chat.sendMessage(parts);
        return { text: result.response.text(), model: modelId };
      }

      const result = await chat.sendMessage(last.content.trim());
      return { text: result.response.text(), model: modelId };
    } catch (error) {
      lastError = error;
      if (!isLikelyGeminiModelUnavailable(error)) {
        break;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
