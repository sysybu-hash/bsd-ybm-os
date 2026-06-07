import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import type { ScanModeV5 } from "@/lib/scan-schema-v5";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";
import {
  isDocAiConfigured,
  isGeminiConfigured,
  isMistralConfigured,
  isOpenAiConfigured,
} from "@/lib/ai-providers";

export type TriEngineRunMode =
  | "AUTO"
  | "MULTI_SEQUENTIAL"
  | "MULTI_PARALLEL"
  | "SINGLE_DOCUMENT_AI"
  | "SINGLE_GEMINI"
  | "SINGLE_OPENAI"
  | "SINGLE_MISTRAL"
  | "SINGLE_ANTHROPIC";

export function parseScanMode(raw: string | null): ScanModeV5 {
  const u = String(raw ?? "").toUpperCase();
  if (
    u === "INVOICE_FINANCIAL" ||
    u === "DRAWING_BOQ" ||
    u === "GENERAL_DOCUMENT" ||
    u === "QUOTE_BOQ" ||
    u === "PROGRESS_BILL" ||
    u === "SITE_LOG"
  ) {
    return u;
  }
  return "GENERAL_DOCUMENT";
}

export function parseTriEngineRunMode(raw: string | null): TriEngineRunMode {
  const u = String(raw ?? "").toUpperCase();
  if (
    u === "AUTO" ||
    u === "MULTI_SEQUENTIAL" ||
    u === "MULTI_PARALLEL" ||
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

type TriEngineProvider = "docai" | "gemini" | "openai" | "mistral";

function selectedProvidersForTriEngine(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): TriEngineProvider[] {
  if (engineRunMode === "SINGLE_DOCUMENT_AI") return ["docai"];
  if (engineRunMode === "SINGLE_GEMINI") return ["gemini"];
  if (engineRunMode === "SINGLE_OPENAI") return ["openai"];
  if (engineRunMode === "SINGLE_MISTRAL") return ["mistral"];
  if (engineRunMode === "MULTI_PARALLEL") {
    return scanMode === "INVOICE_FINANCIAL" ? ["docai", "gemini", "openai"] : ["gemini", "openai"];
  }
  if (engineRunMode === "MULTI_SEQUENTIAL") {
    return scanMode === "INVOICE_FINANCIAL"
      ? ["docai", "openai", "gemini"]
      : scanMode === "DRAWING_BOQ"
        ? ["gemini", "openai"]
        : ["gemini"];
  }
  if (scanMode === "INVOICE_FINANCIAL") return ["docai", "openai", "gemini"];
  if (scanMode === "DRAWING_BOQ") return ["gemini", "openai"];
  return ["gemini"];
}

function isProviderConfigured(provider: TriEngineProvider): boolean {
  if (provider === "docai") return isDocAiConfigured();
  if (provider === "openai") return isOpenAiConfigured();
  if (provider === "mistral") return isMistralConfigured();
  return isGeminiConfigured();
}

export function triEngineCreditKindFor(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): ScanCreditKind {
  const providers = selectedProvidersForTriEngine(scanMode, engineRunMode);
  return providers.some((provider) => provider === "docai" || provider === "openai") ? "premium" : "cheap";
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
  const userInstruction =
    typeof formData.get("userInstruction") === "string"
      ? (formData.get("userInstruction") as string).trim().slice(0, 1200) || null
      : null;
  const openAiModel =
    typeof formData.get("openAiModel") === "string"
      ? (formData.get("openAiModel") as string).trim() || undefined
      : undefined;
  const engineRunMode = parseTriEngineRunMode(
    typeof formData.get("engineRunMode") === "string" ? (formData.get("engineRunMode") as string) : null,
  );

  return { file, scanMode, persist, projectLabel, clientLabel, userInstruction, openAiModel, engineRunMode };
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
