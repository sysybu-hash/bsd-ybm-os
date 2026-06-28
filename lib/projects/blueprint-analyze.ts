import { parseModelJsonText } from "@/lib/ai-document-json";
import { isOpenAiConfigured, isAnthropicConfigured, isGeminiConfigured, isMistralConfigured } from "@/lib/ai-providers";
import { runAiChat } from "@/lib/ai-chat";
import { getBlueprintAnalysisModelChain } from "@/lib/gemini-model";
import { geminiMultimodal } from "@/lib/tri-engine-extract";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import { extractDocumentWithMistral, extractTextWithMistralOCR } from "@/lib/ai-extract-mistral";
import {
  parseBlueprintAnalysis,
  type BlueprintAnalysis,
} from "@/lib/projects/blueprint-analysis-schema";

export type BlueprintEngineRunMode =
  | "AUTO"
  | "MULTI_PARALLEL"
  | "CUSTOM_PARALLEL"
  | "SINGLE_GEMINI"
  | "SINGLE_OPENAI"
  | "SINGLE_ANTHROPIC"
  | "SINGLE_MISTRAL";

export type AnalyzeBlueprintOptions = {
  engineRunMode?: BlueprintEngineRunMode;
  userInstruction?: string | null;
  customEngines?: string[];
  /** Pre-split chunks for large PDFs. If provided, analyzed page-by-page then merged. */
  pdfChunks?: Array<{ base64: string; mimeType: string; pageLabel: string }>;
  /** Use Mistral OCR 4 as pre-pass to extract clean Hebrew text before LLM analysis. */
  useOcrPrepass?: boolean;
};

const BLUEPRINT_INSTRUCTION = `
אתה מהנדס ביצוע בכיר ומפתח כמויות מוסמך עם ניסיון של 20 שנה בענף הבנייה הישראלי.
תפקידך: לנתח את תוכניות הביצוע (גרמושקה) המצורפות ולחלץ ממנה את כל המידע הכמותי והתכנוני.

## כללי חילוץ מחמירים

### כתב כמויות (boqLineItems)
- חלץ **כל** סעיף בניה שמופיע בתוכניות — גם אם המחיר לא ידוע
- לכל סעיף ציין: תיאור מלא (כולל מפרט), יחידת מידה, כמות, מחיר יחידה אם ידוע, סה"כ שורה
- יחידות מקובלות: מ"ר, מ"א, מ"ק, יח', ק"ג, טון, נקודה, ערכה
- drawingRef: מספר תוכנית/גיליון שממנו נלקח הסעיף (חשוב לאימות)
- tradeCategory: סוג מקצוע — "עבודות עפר", "בטון ותשתיות", "בנייה ובלוקים", "טיח וריצוף", "שלד ומבנה", "חשמל", "אינסטלציה", "מסגרות ואלומיניום", "גבס ופנים", "צבע ואיטום", "עבודות חיצוניות", "שונות"
- confidence: 1.0 אם נקרא מספר מדויק מהתוכנית, 0.7 אם הוערך מהמידות, 0.4 אם הוערך מניסיון
- **אל תדלג** על שום סעיף — אפילו קטן. כמות שגויה עם confidence נמוך עדיפה על פני סעיף חסר

### לוח זמנים (tasks)
- רשום משימות לפי סדר הביצוע הלוגי בשטח
- כלול תלויות (dependsOn) בין משימות
- durationDays: הערכה ריאלית לפי סוג ביצוע וכמויות
- tradeCategory: קבלן משנה רלוונטי

### אבני דרך לתשלום (milestones)
- בנה לוח חשבונות חלקיים ריאלי לפי שלבי הביצוע
- percent: אחוז מסכום החוזה הכולל
- לפחות 5 אבני דרך: חיפור+יסודות, שלד, מחסה/גג, גמר פנים, סיום ומסירה

## פורמט JSON מחויב — אין לסטות ממנו:
{
  "projectSummary": "תיאור קצר של הפרויקט: סוג, גודל, מיקום אם ידוע",
  "totalEstimatedCost": סכום כולל משוער בשקלים אם ניתן לחשב,
  "tasks": [
    {
      "name": "שם המשימה",
      "tradeCategory": "סוג מקצוע",
      "durationDays": ימים,
      "dependsOn": ["שם משימה קודמת"],
      "startDate": "YYYY-MM-DD אופציונלי",
      "endDate": "YYYY-MM-DD אופציונלי"
    }
  ],
  "milestones": [
    {
      "name": "שם שלב התשלום",
      "percent": אחוז,
      "amount": סכום בשקלים אם ידוע,
      "description": "מה כולל השלב"
    }
  ],
  "boqLineItems": [
    {
      "description": "תיאור מפורט של הסעיף כולל מפרט",
      "unit": "יחידת מידה",
      "quantity": מספר,
      "unitPrice": מחיר ליחידה אם ידוע,
      "lineTotal": סה"כ שורה אם ניתן לחשב,
      "tradeCategory": "סוג מקצוע",
      "drawingRef": "מ-1/א' / גיליון 3",
      "note": "הערות מיוחדות",
      "confidence": 0.0-1.0
    }
  ],
  "requiresReview": true
}

## חשוב:
- החזר JSON בלבד — ללא מרקדאון, ללא טקסט לפני או אחרי
- אם מידע חסר — אל תמציא. השתמש ב-confidence נמוך ו-note מסביר
- עבור על כל עמוד בתוכנית ואל תוותר על פרטים
`.trim();

function buildInstruction(userInstruction?: string | null, pageHint?: string): string {
  const extra = userInstruction?.trim();
  const base = pageHint
    ? `${BLUEPRINT_INSTRUCTION}\n\n### הערה: אתה מנתח ${pageHint} בלבד. חלץ את כל הסעיפים מחלק זה.`
    : BLUEPRINT_INSTRUCTION;
  if (!extra) return base;
  return `${base}\n\n### הוראות נוספות מהמשתמש:\n${extra.slice(0, 800)}`;
}

/**
 * PDF גדול (>8 עמודים) — מחלק לחתיכות ומנתח כל אחת בנפרד, אחר מאחד.
 * base64Split: מערך של base64 strings, כל אחד chunk של עמודים.
 */
async function analyzeChunkedPdf(
  chunks: Array<{ base64: string; mimeType: string; pageLabel: string }>,
  runner: (base64: string, mimeType: string, instruction: string) => Promise<BlueprintAnalysis>,
  userInstruction?: string | null,
): Promise<BlueprintAnalysis> {
  const partials = await Promise.allSettled(
    chunks.map((c) =>
      runner(c.base64, c.mimeType, buildInstruction(userInstruction, c.pageLabel)),
    ),
  );
  const results: BlueprintAnalysis[] = partials
    .filter((r): r is PromiseFulfilledResult<BlueprintAnalysis> => r.status === "fulfilled")
    .map((r) => r.value);
  if (results.length === 0) throw new Error("כל חלקי הניתוח נכשלו");
  return mergeBlueprintResults(results);
}

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

async function runGeminiBlueprintAnalysis(
  base64: string, mimeType: string, instruction: string,
): Promise<BlueprintAnalysis> {
  const modelChain = getBlueprintAnalysisModelChain();
  return parseRawBlueprint(await geminiMultimodal(base64, mimeType, instruction, modelChain));
}

async function runOpenAiBlueprintAnalysis(
  base64: string, mimeType: string, instruction: string,
): Promise<BlueprintAnalysis> {
  return parseRawBlueprint(await extractDocumentWithOpenAI(base64, mimeType, "blueprint.pdf", instruction));
}

async function runAnthropicBlueprintAnalysis(
  base64: string, mimeType: string, instruction: string,
): Promise<BlueprintAnalysis> {
  return parseRawBlueprint(await extractDocumentWithAnthropic(base64, mimeType, "blueprint.pdf", instruction));
}

async function runMistralBlueprintAnalysis(
  base64: string, mimeType: string, instruction: string,
): Promise<BlueprintAnalysis> {
  return parseRawBlueprint(await extractDocumentWithMistral(base64, mimeType, "blueprint.pdf", instruction));
}

const ENGINE_RUNNERS = {
  gemini:    { check: isGeminiConfigured,    fn: runGeminiBlueprintAnalysis },
  openai:    { check: isOpenAiConfigured,    fn: runOpenAiBlueprintAnalysis },
  anthropic: { check: isAnthropicConfigured, fn: runAnthropicBlueprintAnalysis },
  mistral:   { check: isMistralConfigured,   fn: runMistralBlueprintAnalysis },
} as const;

type EngineKey = keyof typeof ENGINE_RUNNERS;

async function runParallel(
  engineKeys: EngineKey[],
  base64: string, mimeType: string, instruction: string,
): Promise<BlueprintAnalysis & { enginesUsed: string[] }> {
  const runners = engineKeys.filter((k) => ENGINE_RUNNERS[k].check());
  if (runners.length === 0) throw new Error("אין מנועי AI מוגדרים לפענוח גרמושקה");

  const settled = await Promise.allSettled(
    runners.map((k) => ENGINE_RUNNERS[k].fn(base64, mimeType, instruction)),
  );
  const successes: BlueprintAnalysis[] = [];
  const usedNames: string[] = [];
  settled.forEach((res, i) => {
    if (res.status === "fulfilled") { successes.push(res.value); usedNames.push(runners[i]!); }
  });
  if (successes.length === 0) throw new Error("כל מנועי ה-AI נכשלו בפענוח הגרמושקה");
  const merged = successes.length === 1 ? successes[0]! : mergeBlueprintResults(successes);
  return { ...merged, enginesUsed: usedNames };
}

function mergeBlueprintResults(results: BlueprintAnalysis[]): BlueprintAnalysis {
  const taskNames = new Set<string>();
  const milestoneNames = new Set<string>();
  const boqDescs = new Map<string, BlueprintAnalysis["boqLineItems"][number]>();
  const tasks: BlueprintAnalysis["tasks"] = [];
  const milestones: BlueprintAnalysis["milestones"] = [];
  let projectSummary: string | undefined;
  let totalEstimatedCost: number | undefined;

  for (const r of results) {
    if (!projectSummary && r.projectSummary) projectSummary = r.projectSummary;
    if (!totalEstimatedCost && r.totalEstimatedCost) totalEstimatedCost = r.totalEstimatedCost;
    for (const t of r.tasks) {
      if (!taskNames.has(t.name)) { taskNames.add(t.name); tasks.push(t); }
    }
    for (const m of r.milestones) {
      if (!milestoneNames.has(m.name)) { milestoneNames.add(m.name); milestones.push(m); }
    }
    for (const b of r.boqLineItems) {
      const key = b.description.trim().toLowerCase();
      const existing = boqDescs.get(key);
      if (!existing || (b.confidence ?? 0) > (existing.confidence ?? 0)) boqDescs.set(key, b);
    }
  }
  return {
    tasks,
    milestones,
    boqLineItems: Array.from(boqDescs.values()),
    projectSummary,
    totalEstimatedCost,
    requiresReview: true,
  };
}

export async function analyzeBlueprintFile(
  base64: string,
  mimeType: string,
  options?: AnalyzeBlueprintOptions,
): Promise<BlueprintAnalysis & { enginesUsed: string[] }> {
  const mode = options?.engineRunMode ?? "AUTO";
  const chunks = options?.pdfChunks;

  // OCR pre-pass: extract clean Hebrew text first, then embed in instruction
  let ocrText: string | null = null;
  if (options?.useOcrPrepass && isMistralConfigured()) {
    try {
      ocrText = await extractTextWithMistralOCR(base64, mimeType);
    } catch {
      // non-fatal — fall back to direct vision analysis
    }
  }

  const ocrPreamble = ocrText
    ? `\n\n### טקסט שחולץ על-ידי Mistral OCR 4 (השתמש בו כמקור הראשי לכמויות):\n\`\`\`\n${ocrText.slice(0, 40000)}\n\`\`\`\n`
    : "";

  function buildInstructionWithOcr(userInstruction?: string | null, pageHint?: string): string {
    const base = buildInstruction(userInstruction, pageHint);
    return ocrPreamble ? `${base}${ocrPreamble}` : base;
  }

  // Helpers that respect chunks when present
  async function runWithChunks(
    _engineKey: EngineKey,
    singleFn: (b: string, m: string, i: string) => Promise<BlueprintAnalysis>,
  ): Promise<BlueprintAnalysis> {
    const inst = buildInstructionWithOcr(options?.userInstruction);
    if (chunks && chunks.length > 1) {
      return analyzeChunkedPdf(chunks, singleFn, options?.userInstruction);
    }
    return singleFn(base64, mimeType, inst);
  }
  if (mode === "SINGLE_GEMINI") {
    if (!isGeminiConfigured()) throw new Error("Gemini לא מוגדר");
    return { ...await runWithChunks("gemini", runGeminiBlueprintAnalysis), enginesUsed: ["gemini"] };
  }
  if (mode === "SINGLE_OPENAI") {
    if (!isOpenAiConfigured()) throw new Error("OpenAI לא מוגדר");
    return { ...await runWithChunks("openai", runOpenAiBlueprintAnalysis), enginesUsed: ["openai"] };
  }
  if (mode === "SINGLE_ANTHROPIC") {
    if (!isAnthropicConfigured()) throw new Error("Claude לא מוגדר");
    return { ...await runWithChunks("anthropic", runAnthropicBlueprintAnalysis), enginesUsed: ["anthropic"] };
  }
  if (mode === "SINGLE_MISTRAL") {
    if (!isMistralConfigured()) throw new Error("Mistral לא מוגדר");
    return { ...await runWithChunks("mistral", runMistralBlueprintAnalysis), enginesUsed: ["mistral"] };
  }

  if (mode === "MULTI_PARALLEL") {
    if (chunks && chunks.length > 1) {
      // For large PDFs: pick the best available engine for each chunk, then merge
      const primaryKey: EngineKey = isGeminiConfigured() ? "gemini"
        : isAnthropicConfigured() ? "anthropic"
        : isOpenAiConfigured() ? "openai"
        : "mistral";
      if (!ENGINE_RUNNERS[primaryKey].check()) throw new Error("אין מנועי AI מוגדרים");
      const chunked = await analyzeChunkedPdf(chunks, ENGINE_RUNNERS[primaryKey].fn, options?.userInstruction);
      return { ...chunked, enginesUsed: [primaryKey, "multipass"] };
    }
    return runParallel(["gemini", "openai", "anthropic", "mistral"], base64, mimeType, buildInstructionWithOcr(options?.userInstruction));
  }

  if (mode === "CUSTOM_PARALLEL") {
    const custom = (options?.customEngines ?? []).filter(
      (k): k is EngineKey => k in ENGINE_RUNNERS,
    );
    if (custom.length === 0) throw new Error("לא נבחרו מנועים לפענוח מותאם");
    return runParallel(custom, base64, mimeType, buildInstructionWithOcr(options?.userInstruction));
  }

  // AUTO: Gemini multipass for large PDF → OpenAI fallback for JSON repair
  const instruction = buildInstructionWithOcr(options?.userInstruction);
  if (chunks && chunks.length > 1 && isGeminiConfigured()) {
    const merged = await analyzeChunkedPdf(chunks, runGeminiBlueprintAnalysis, options?.userInstruction);
    return { ...merged, enginesUsed: ["gemini", "multipass"] };
  }
  const modelChain = getBlueprintAnalysisModelChain();
  const raw = await geminiMultimodal(base64, mimeType, instruction, modelChain);
  try {
    return { ...parseRawBlueprint(raw), enginesUsed: ["gemini"] };
  } catch {
    const repaired = await openAiBlueprintRepair(
      typeof raw === "object" ? JSON.stringify(raw) : String(raw),
    );
    if (repaired) return { ...repaired, enginesUsed: ["gemini", "openai"] };
    throw new Error("פענוח הגרמושקה נכשל");
  }
}
