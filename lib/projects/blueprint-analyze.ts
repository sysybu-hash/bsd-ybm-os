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
import { mergeBlueprintResults, normKey, normalizeMilestones } from "@/lib/projects/blueprint-analyze-merge";

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
דיוק מוחלט הוא דרישת העל — שגיאה בכמות עולה כסף אמיתי.

## כללים מחייבים לחילוץ

### כתב כמויות (boqLineItems)
- עבור על **כל** גיליון בתוכניות. אל תתעלם מגיליון אחד.
- לכל פריט: תיאור מלא עם מפרט טכני, יחידת מידה, כמות מחושבת ממידות התוכנית, מחיר יחידה, סה"כ שורה
- יחידות מקובלות: מ"ר, מ"א, מ"ק, יח', ק"ג, טון, נקודה, ערכה
- drawingRef: ציין שם גיליון + מספר חתך מדויק (לדוגמה: "גיליון 4, חתך E-E")
- tradeCategory חייב להיות אחד מ: "עבודות עפר", "בטון ותשתיות", "בנייה ובלוקים", "טיח וריצוף", "שלד ומבנה", "חשמל", "אינסטלציה", "מסגרות ואלומיניום", "גבס ופנים", "צבע ואיטום", "איטום ופיתוח", "עבודות חיצוניות", "שונות"
- confidence: 1.0 = נקרא מספר מדויק, 0.7 = חושב ממידות בתוכנית, 0.4 = הערכה מניסיון
- **אסור לדלג** על שום פריט — כמות עם confidence 0.4 עדיפה על חסר

### כללי דיוק כמויות — קריטי
1. **שטחי טיח וצבע**: חשב רק על קירות/תקרות **חדשים** שנבנים בפרויקט זה. אל תכלול קירות קיימים שלא משופצים. היכן שיש קיר חדש דו-צדדי — כפל פי 2.
2. **פרופילי פלדה**: הבחן בין IPN, IPE, HEB, HEA — אלו פרופילים שונים לחלוטין עם משקל ומחיר שונים. ציין בדיוק מה כתוב בתוכנית. אל תבלבל ביניהם.
3. **מדרגות**: ספור את מספר המדרגות בכל גרם. חשב שטח חיפוי = (רוחב שלח + גובה רום) × רוחב מדרגה × מספר מדרגות. אל תכפיל ב-2 ללא סיבה.
4. **עמודים ותוספות בטון**: חשב נפח = חתך (מ"ר) × גובה (מ). הגובה הוא גובה הקומה, לא כולל יסוד אלא אם כן מסומן.
5. **פיר מעלית**: חשב נפח קירות בטון = היקף × עובי × גובה כולל. ברר את ממדי הפיר מהתוכניות.
6. **פרויקט עם מרתף** (מפלס שלילי): **חובה** לבדוק ולכלול איטום קירות מרתף וריצפה.

### אבני דרך לתשלום (milestones) — כלל ברזל
- **סכום כל האחוזים חייב להיות בדיוק 100%**. לא 90%, לא 120% — 100% בלבד.
- צור 5–7 אבני דרך לוגיות לפי שלבי הביצוע בפועל. אל תמציא כפילויות.
- לא לחרוג מ-7 אבני דרך כדי למנוע בלגן.
- amount = (percent/100) × totalEstimatedCost

### לוח זמנים (tasks)
- רשום משימות לפי סדר ביצוע לוגי בשטח, כולל תלויות (dependsOn)
- durationDays: הערכה ריאלית לפי כמויות וסוג ביצוע
- אין להכפיל משימות — כל פעולה פיזית מופיעה פעם אחת בלבד

## פורמט JSON מחויב — אין לסטות ממנו:
{
  "projectSummary": "תיאור קצר: סוג פרויקט, גודל משוער, מספר מפלסים, עבודות עיקריות",
  "totalEstimatedCost": סכום כולל בשקלים,
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
      "percent": אחוז_מספרי,
      "amount": סכום_בשקלים,
      "description": "מה כולל השלב הזה בדיוק"
    }
  ],
  "boqLineItems": [
    {
      "description": "תיאור מלא עם מפרט טכני מדויק",
      "unit": "יחידת מידה",
      "quantity": מספר,
      "unitPrice": מחיר_ליחידה,
      "lineTotal": סה_כ_שורה,
      "tradeCategory": "סוג מקצוע",
      "drawingRef": "גיליון X, חתך Y-Y",
      "note": "הסבר חישוב הכמות או הערת מפרט",
      "confidence": 0.0_עד_1.0
    }
  ],
  "requiresReview": true
}

## כללי פלט
- החזר JSON בלבד — ללא markdown, ללא טקסט לפני/אחרי, ללא \`\`\`json
- אם מידע חסר — confidence נמוך + note מסביר, לא השמטה
- אמת עם עצמך לפני הגשה: האם אחוזי אבני הדרך מסתכמים ל-100%? האם יש כפילויות בסעיפים?
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
 * PDF גדול — מנתח כל chunk לחילוץ BOQ, ואת ה-chunk הראשון לחילוץ tasks+milestones.
 * הפרדה זו מונעת כפילות של אבני דרך ומשימות מכל chunk.
 * מיוצא לצורכי בדיקה (mבחן הזרקת ה-OCR preamble לכל chunk).
 */
export async function analyzeChunkedPdf(
  chunks: Array<{ base64: string; mimeType: string; pageLabel: string }>,
  runner: (base64: string, mimeType: string, instruction: string) => Promise<BlueprintAnalysis>,
  userInstruction?: string | null,
  ocrPreamble = "",
): Promise<BlueprintAnalysis> {
  const BOQ_ONLY_SUFFIX = `\n\n### הוראה חשובה: חלץ רק boqLineItems מחלק זה. השאר את tasks, milestones, projectSummary ו-totalEstimatedCost ריקים/null — הם יחולצו מחלק אחר.`;
  const OVERVIEW_SUFFIX = `\n\n### הוראה חשובה: חלץ את כל השדות — tasks, milestones, boqLineItems, projectSummary ו-totalEstimatedCost. זהו החלק הראשי של התוכניות.`;

  const overviewChunk = chunks[0]!;
  const boqChunks = chunks.slice(1);

  const overviewInst = buildInstruction(userInstruction, overviewChunk.pageLabel) + OVERVIEW_SUFFIX + ocrPreamble;
  const overviewResult = await runner(overviewChunk.base64, overviewChunk.mimeType, overviewInst);

  const boqPartials = await Promise.allSettled(
    boqChunks.map((c) => {
      const inst = buildInstruction(userInstruction, c.pageLabel) + BOQ_ONLY_SUFFIX + ocrPreamble;
      return runner(c.base64, c.mimeType, inst);
    }),
  );
  const boqResults: BlueprintAnalysis[] = boqPartials
    .filter((r): r is PromiseFulfilledResult<BlueprintAnalysis> => r.status === "fulfilled")
    .map((r) => r.value);

  // Merge BOQ from all chunks, keep tasks+milestones from overview only
  const allBoq = [overviewResult, ...boqResults];
  const boqDescs = new Map<string, BlueprintAnalysis["boqLineItems"][number]>();
  for (const r of allBoq) {
    for (const b of r.boqLineItems) {
      const key = normKey(b.description);
      const existing = boqDescs.get(key);
      if (!existing || (b.confidence ?? 0) > (existing.confidence ?? 0)) boqDescs.set(key, b);
    }
  }

  const milestones = normalizeMilestones(overviewResult.milestones, overviewResult.totalEstimatedCost);

  return {
    tasks: overviewResult.tasks,
    milestones,
    boqLineItems: Array.from(boqDescs.values()),
    projectSummary: overviewResult.projectSummary,
    totalEstimatedCost: overviewResult.totalEstimatedCost,
    requiresReview: true,
  };
}

function parseRawBlueprint(raw: unknown): BlueprintAnalysis {
  const parsed = typeof raw === "object" && raw !== null
    ? parseBlueprintAnalysis(raw as Record<string, unknown>)
    : parseBlueprintAnalysis(parseModelJsonText(String(raw)));
  // Always normalize milestones even for single-engine results
  return {
    ...parsed,
    milestones: normalizeMilestones(parsed.milestones, parsed.totalEstimatedCost),
  };
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
      return analyzeChunkedPdf(chunks, singleFn, options?.userInstruction, ocrPreamble);
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
      const chunked = await analyzeChunkedPdf(chunks, ENGINE_RUNNERS[primaryKey].fn, options?.userInstruction, ocrPreamble);
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
    const merged = await analyzeChunkedPdf(chunks, runGeminiBlueprintAnalysis, options?.userInstruction, ocrPreamble);
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
