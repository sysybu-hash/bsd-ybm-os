import { parseModelJsonText } from "@/lib/ai-document-json";
import { isOpenAiConfigured, isAnthropicConfigured, isGeminiConfigured } from "@/lib/ai-providers";
import { runAiChat } from "@/lib/ai-chat";
import { getBlueprintAnalysisModelChain } from "@/lib/gemini-model";
import { geminiMultimodal } from "@/lib/tri-engine-extract";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import {
  parseBlueprintAnalysis,
  type BlueprintAnalysis,
} from "@/lib/projects/blueprint-analysis-schema";

export type BlueprintEngineRunMode =
  | "AUTO"
  | "MULTI_PARALLEL"
  | "SINGLE_GEMINI"
  | "SINGLE_OPENAI"
  | "SINGLE_ANTHROPIC";

export type AnalyzeBlueprintOptions = {
  engineRunMode?: BlueprintEngineRunMode;
  userInstruction?: string | null;
};

const BLUEPRINT_INSTRUCTION = `
אתה מהנדס ביצוע ומפתח כמויות מומחה. נתח את מסמך הביצוע / הגרמושקה המצורפת.
הפק כתב כמויות, משימות ללוח זמנים (גנט) ושלבי תשלום מומלצים (חשבונות חלקיים).
החזר אך ורק אובייקט JSON תקין בפורמט:
{
  "tasks": [{ "name": "שם משימה", "startDate": "ISO-8601 אופציונלי", "endDate": "ISO-8601 אופציונלי" }],
  "milestones": [{ "name": "תיאור שלב תשלום", "percent": אחוז מחוזה 0-100, "amount": סכום בשקלים רק אם ידוע }],
  "boqLineItems": [{ "description": "תיאור סעיף", "unit": "מ\"ר", "quantity": מספר, "note": "הערה", "confidence": 0.0-1.0 }],
  "requiresReview": true
}
ללא טקסט נוסף מחוץ ל-JSON.
`.trim();

function buildInstruction(userInstruction?: string | null): string {
  const extra = userInstruction?.trim();
  if (!extra) return BLUEPRINT_INSTRUCTION;
  return `${BLUEPRINT_INSTRUCTION}\n\n### הוראות נוספות מהמשתמש:\n${extra.slice(0, 800)}`;
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

function mergeBlueprintResults(results: BlueprintAnalysis[]): BlueprintAnalysis {
  const taskNames = new Set<string>();
  const milestoneNames = new Set<string>();
  const boqDescs = new Map<string, BlueprintAnalysis["boqLineItems"][number]>();
  const tasks: BlueprintAnalysis["tasks"] = [];
  const milestones: BlueprintAnalysis["milestones"] = [];

  for (const r of results) {
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
  return { tasks, milestones, boqLineItems: Array.from(boqDescs.values()), requiresReview: true };
}

export async function analyzeBlueprintFile(
  base64: string,
  mimeType: string,
  options?: AnalyzeBlueprintOptions,
): Promise<BlueprintAnalysis & { enginesUsed: string[] }> {
  const mode = options?.engineRunMode ?? "AUTO";
  const instruction = buildInstruction(options?.userInstruction);

  if (mode === "SINGLE_OPENAI") {
    if (!isOpenAiConfigured()) throw new Error("OpenAI לא מוגדר");
    return { ...await runOpenAiBlueprintAnalysis(base64, mimeType, instruction), enginesUsed: ["openai"] };
  }

  if (mode === "SINGLE_ANTHROPIC") {
    if (!isAnthropicConfigured()) throw new Error("Claude לא מוגדר");
    return { ...await runAnthropicBlueprintAnalysis(base64, mimeType, instruction), enginesUsed: ["anthropic"] };
  }

  if (mode === "SINGLE_GEMINI") {
    if (!isGeminiConfigured()) throw new Error("Gemini לא מוגדר");
    return { ...await runGeminiBlueprintAnalysis(base64, mimeType, instruction), enginesUsed: ["gemini"] };
  }

  if (mode === "MULTI_PARALLEL") {
    const runners: Array<{ name: string; fn: () => Promise<BlueprintAnalysis> }> = [];
    if (isGeminiConfigured()) runners.push({ name: "gemini", fn: () => runGeminiBlueprintAnalysis(base64, mimeType, instruction) });
    if (isOpenAiConfigured()) runners.push({ name: "openai", fn: () => runOpenAiBlueprintAnalysis(base64, mimeType, instruction) });
    if (isAnthropicConfigured()) runners.push({ name: "anthropic", fn: () => runAnthropicBlueprintAnalysis(base64, mimeType, instruction) });
    if (runners.length === 0) throw new Error("אין מנועי AI מוגדרים לפענוח גרמושקה");

    const settled = await Promise.allSettled(runners.map((r) => r.fn()));
    const successes: BlueprintAnalysis[] = [];
    const usedNames: string[] = [];
    settled.forEach((res, i) => {
      if (res.status === "fulfilled") { successes.push(res.value); usedNames.push(runners[i]!.name); }
    });

    if (successes.length === 0) throw new Error("כל מנועי ה-AI נכשלו בפענוח הגרמושקה");
    const merged = successes.length === 1 ? successes[0]! : mergeBlueprintResults(successes);
    return { ...merged, enginesUsed: usedNames };
  }

  // AUTO: Gemini primary → OpenAI fallback for JSON repair
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
