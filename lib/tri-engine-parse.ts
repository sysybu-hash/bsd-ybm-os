import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import { ALL_SCAN_MODES } from "@/lib/scan-modes-for-ui";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";
import {
  isAnthropicConfigured,
  isDocAiConfigured,
  isGeminiConfigured,
  isMistralConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";

export type TriEngineRunMode =
  | "AUTO"
  | "MULTI_SEQUENTIAL"
  | "MULTI_PARALLEL"
  | "CUSTOM_PARALLEL"
  | "SINGLE_DOCUMENT_AI"
  | "SINGLE_GEMINI"
  | "SINGLE_OPENAI"
  | "SINGLE_MISTRAL"
  | "SINGLE_ANTHROPIC";

export function parseScanMode(raw: string | null): ScanModeV5 {
  const u = String(raw ?? "").toUpperCase();
  if (ALL_SCAN_MODES.has(u as ScanModeV5)) return u as ScanModeV5;
  return "GENERAL_DOCUMENT";
}

export function parseTriEngineRunMode(raw: string | null): TriEngineRunMode {
  const u = String(raw ?? "").toUpperCase();
  if (
    u === "AUTO" ||
    u === "MULTI_SEQUENTIAL" ||
    u === "MULTI_PARALLEL" ||
    u === "CUSTOM_PARALLEL" ||
    u === "SINGLE_DOCUMENT_AI" ||
    u === "SINGLE_GEMINI" ||
    u === "SINGLE_OPENAI" ||
    u === "SINGLE_MISTRAL" ||
    u === "SINGLE_ANTHROPIC"
  ) {
    return u;
  }
  return "AUTO";
}

type TriEngineProvider = "docai" | "gemini" | "openai" | "mistral" | "anthropic";

/** מנועי פרמיום — נוכחותם במסלול הופכת את הסריקה לחיוב פרמיום. */
const PREMIUM_PROVIDERS: ReadonlySet<TriEngineProvider> = new Set(["docai", "openai", "anthropic"]);

/**
 * מצבי scanMode שבהם Anthropic/Claude מצטיין (PDF נייטיב, מסמכים ארוכים/נרטיביים)
 * ולכן מנותב ב-AUTO כמנוע ראשי — בכפוף לזמינות קרדיט פרמיום (downgrade חינני בשער).
 */
export function scanModeFavorsAnthropic(scanMode: ScanModeV5): boolean {
  return scanMode === "CONTRACT";
}

function selectedProvidersForTriEngine(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): TriEngineProvider[] {
  if (engineRunMode === "SINGLE_DOCUMENT_AI") return ["docai"];
  if (engineRunMode === "SINGLE_GEMINI") return ["gemini"];
  if (engineRunMode === "SINGLE_OPENAI") return ["openai"];
  if (engineRunMode === "SINGLE_MISTRAL") return ["mistral"];
  if (engineRunMode === "SINGLE_ANTHROPIC") return ["anthropic"];
  if (engineRunMode === "MULTI_PARALLEL") {
    return scanMode === "INVOICE_FINANCIAL" ? ["docai", "gemini", "openai"] : ["gemini", "openai"];
  }
  if (engineRunMode === "MULTI_SEQUENTIAL") {
    return scanMode === "INVOICE_FINANCIAL"
      ? ["docai", "openai", "gemini"]
      : scanMode === "DRAWING_BOQ"
        ? ["gemini", "openai"]
        : scanModeFavorsAnthropic(scanMode) && isAnthropicConfigured()
          ? ["anthropic", "gemini"]
          : ["gemini"];
  }
  if (scanMode === "INVOICE_FINANCIAL") return ["docai", "openai", "gemini"];
  if (scanMode === "DRAWING_BOQ") return ["gemini", "openai"];
  if (scanModeFavorsAnthropic(scanMode) && isAnthropicConfigured()) return ["anthropic", "gemini"];
  return ["gemini"];
}

function isProviderConfigured(provider: TriEngineProvider): boolean {
  if (provider === "docai") return isDocAiConfigured();
  if (provider === "openai") return isOpenAiConfigured();
  if (provider === "mistral") return isMistralConfigured();
  if (provider === "anthropic") return isAnthropicConfigured();
  return isGeminiConfigured();
}

export function triEngineCreditKindFor(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): ScanCreditKind {
  const providers = selectedProvidersForTriEngine(scanMode, engineRunMode);
  return providers.some((provider) => PREMIUM_PROVIDERS.has(provider)) ? "premium" : "cheap";
}

export type ParsedTriEngineForm = {
  file: File;
  scanMode: ScanModeV5;
  persist: boolean;
  projectLabel: string | null;
  clientLabel: string | null;
  userInstruction: string | null;
  openAiModel?: string;
  engineRunMode: TriEngineRunMode;
  /** מנועים מותאמים אישית — בשימוש עם CUSTOM_PARALLEL */
  customEngines?: string[];
  docTypeAutoDetect: boolean;
};

/** מחזיר null אם חסר קובץ */
export function parseTriEngineFormData(formData: FormData): ParsedTriEngineForm | null {
  const file = formData.get("file");
  if (!(file instanceof File)) return null;

  const scanMode = parseScanMode(
    typeof formData.get("scanMode") === "string" ? (formData.get("scanMode") as string) : null,
  );
  const persist = formData.get("persist") === "true";
  const projectLabel =
    typeof formData.get("project") === "string" ? (formData.get("project") as string).trim() || null : null;
  const clientLabel =
    typeof formData.get("client") === "string" ? (formData.get("client") as string).trim() || null : null;
  const baseInstruction =
    typeof formData.get("userInstruction") === "string"
      ? (formData.get("userInstruction") as string).trim().slice(0, 1200) || null
      : null;
  // Rescan-loop correction: user-supplied note appended with explicit framing so
  // the LLM treats it as a targeted fix on this pass.
  const customInstructions =
    typeof formData.get("customInstructions") === "string"
      ? (formData.get("customInstructions") as string).trim().slice(0, 800) || null
      : null;
  const userInstruction = customInstructions
    ? `${baseInstruction ? `${baseInstruction}\n\n` : ""}USER CORRECTION/INSTRUCTION FOR THIS RESCAN: ${customInstructions}`
    : baseInstruction;
  const openAiModel =
    typeof formData.get("openAiModel") === "string"
      ? (formData.get("openAiModel") as string).trim() || undefined
      : undefined;
  const engineRunMode = parseTriEngineRunMode(
    typeof formData.get("engineRunMode") === "string" ? (formData.get("engineRunMode") as string) : null,
  );
  const docTypeAutoDetect = formData.get("docTypeAutoDetect") === "true";

  const rawCustomEngines = typeof formData.get("customEngines") === "string"
    ? (formData.get("customEngines") as string).trim()
    : "";
  const customEngines = rawCustomEngines
    ? rawCustomEngines.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    file,
    scanMode,
    persist,
    projectLabel,
    clientLabel,
    userInstruction,
    openAiModel,
    engineRunMode,
    customEngines,
    docTypeAutoDetect,
  };
}

export function validateTriEngineRequest(parsed: ParsedTriEngineForm):
  | { ok: true }
  | { ok: false; status: number; error: string; code: string } {
  if (parsed.file.size <= 0) {
    return { ok: false, status: 400, error: "הקובץ ריק.", code: "empty_file" };
  }
  if (parsed.file.size > MAX_SCAN_FILE_BYTES) {
    return {
      ok: false,
      status: 413,
      error: "הקובץ גדול מדי. ניתן לסרוק קבצים עד 25MB.",
      code: "file_too_large",
    };
  }

  const mimeType = inferMimeFromFileName(parsed.file.name, parsed.file.type || "application/octet-stream");
  if (!isSupportedScanMime(mimeType)) {
    return {
      ok: false,
      status: 415,
      error: "סוג הקובץ אינו נתמך בלוח הסריקה.",
      code: "unsupported_file_type",
    };
  }

  const providers = selectedProvidersForTriEngine(parsed.scanMode, parsed.engineRunMode);
  const configured = providers.filter(isProviderConfigured);
  if (parsed.engineRunMode.startsWith("SINGLE_") && configured.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "המנוע היחיד שנבחר אינו מוגדר בסביבה.",
      code: "selected_engine_not_configured",
    };
  }
  if (configured.length === 0) {
    return {
      ok: false,
      status: 503,
      error: "לא הוגדר אף מנוע פעיל למסלול הסריקה שנבחר.",
      code: "no_engine_configured",
    };
  }

  return { ok: true };
}
