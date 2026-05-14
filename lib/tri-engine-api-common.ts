import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAndDeductScanCredit, resolveOrganizationForUser } from "@/lib/quota-check";
import { readRequestMessages } from "@/lib/i18n/server-messages";
import { getServerLocale } from "@/lib/i18n/server";
import { inferMimeFromFileName, isSupportedScanMime, MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import { v5ToPersistableAiData } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import { persistDocumentLineItemsFromAiData } from "@/lib/persist-document-lines";
import { sendDocNotification } from "@/app/actions/send-doc-notification";
import { getPriceSpikeAlerts, type PriceSpikeAlert } from "@/lib/erp-price-spikes";
import { filterAlertsForScan } from "@/lib/scan-sync-summary";
import type { MessageTree } from "@/lib/i18n/keys";
import type { ScanUsageWarningId } from "@/lib/decrement-scan";
import { API_MSG_UNAUTHORIZED } from "@/lib/api-json";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";
import { isDocAiConfigured, isGeminiConfigured, isOpenAiConfigured } from "@/lib/ai-providers";

export const TRI_ENGINE_RATE_PER_HOUR = 40;
export const TRI_ENGINE_RATE_PER_HOUR_ADMIN = 120;
/** תיעוד בלבד — בנתיבי App Router חייבים `export const maxDuration = 300` כליטרל (לא ייבוא). */
export const TRI_ENGINE_MAX_DURATION_SEC = 300;

export type TriEngineRunMode =
  | "AUTO"
  | "MULTI_SEQUENTIAL"
  | "MULTI_PARALLEL"
  | "SINGLE_DOCUMENT_AI"
  | "SINGLE_GEMINI"
  | "SINGLE_OPENAI";

export function parseScanMode(raw: string | null): ScanModeV5 {
  const u = String(raw ?? "").toUpperCase();
  if (u === "INVOICE_FINANCIAL" || u === "DRAWING_BOQ" || u === "GENERAL_DOCUMENT") {
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
    u === "SINGLE_OPENAI"
  ) {
    return u;
  }
  return "AUTO";
}

type TriEngineProvider = "docai" | "gemini" | "openai";

function selectedProvidersForTriEngine(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): TriEngineProvider[] {
  if (engineRunMode === "SINGLE_DOCUMENT_AI") return ["docai"];
  if (engineRunMode === "SINGLE_GEMINI") return ["gemini"];
  if (engineRunMode === "SINGLE_OPENAI") return ["openai"];
  if (engineRunMode === "MULTI_PARALLEL") {
    return scanMode === "INVOICE_FINANCIAL" ? ["docai", "gemini", "openai"] : ["gemini", "openai"];
  }
  if (engineRunMode === "MULTI_SEQUENTIAL") {
    return scanMode === "INVOICE_FINANCIAL" ? ["docai", "openai", "gemini"] : scanMode === "DRAWING_BOQ" ? ["gemini", "openai"] : ["gemini"];
  }
  if (scanMode === "INVOICE_FINANCIAL") return ["docai", "openai", "gemini"];
  if (scanMode === "DRAWING_BOQ") return ["gemini", "openai"];
  return ["gemini"];
}

export function triEngineCreditKindFor(
  scanMode: ScanModeV5,
  engineRunMode: TriEngineRunMode,
): ScanCreditKind {
  const providers = selectedProvidersForTriEngine(scanMode, engineRunMode);
  return providers.some((provider) => provider === "docai" || provider === "openai") ? "premium" : "cheap";
}

function isProviderConfigured(provider: TriEngineProvider): boolean {
  if (provider === "docai") return isDocAiConfigured();
  if (provider === "openai") return isOpenAiConfigured();
  return isGeminiConfigured();
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

export type TriEngineGateOk = {
  userId: string;
  orgId: string;
  organizationId: string;
  usageWarnings?: ScanUsageWarningId[];
};

export type TriEngineGateResult =
  | ({ ok: true } & TriEngineGateOk)
  | { ok: false; status: number; error: string; resetAt?: Date; code?: string };

export async function triEngineAuthorizeAndCharge(
  session: Session | null,
  scanCreditKind: ScanCreditKind,
): Promise<TriEngineGateResult> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: API_MSG_UNAUTHORIZED };
  }

  const orgId = session.user.organizationId ?? "";
  if (!orgId) {
    return { ok: false, status: 400, error: "לא נמצא ארגון" };
  }

  const dev = isAdmin(session.user.email);
  const rl = await checkRateLimit(
    `tri-scan:${orgId}`,
    dev ? TRI_ENGINE_RATE_PER_HOUR_ADMIN : TRI_ENGINE_RATE_PER_HOUR,
    60 * 60 * 1000,
  );
  if (!rl.success) {
    return {
      ok: false,
      status: 429,
      error: "חרגת ממכסת סריקות Tri-Engine לשעה",
      resetAt: rl.resetAt,
    };
  }

  const resolvedOrg = await resolveOrganizationForUser(orgId, session.user.id);
  if (!resolvedOrg) {
    return { ok: false, status: 400, error: "ארגון לא תקין" };
  }

  const quota = await checkAndDeductScanCredit(resolvedOrg.id, session.user.id, scanCreditKind);
  if (!quota.allowed) {
    return {
      ok: false,
      status: 402,
      error: quota.error,
      code: quota.code ?? "QUOTA_EXCEEDED",
    };
  }

  return {
    ok: true,
    userId: session.user.id,
    orgId,
    organizationId: quota.organizationId,
    usageWarnings: quota.usageWarnings,
  };
}

export type TriEngineExtractionInput = {
  base64: string;
  mimeType: string;
  fileName: string;
  scanMode: ScanModeV5;
  locale: string;
  industry: string;
  orgTrade: string | null;
  messages: MessageTree;
  openAiModel?: string;
  engineRunMode: TriEngineRunMode;
  userInstruction?: string | null;
};

export async function loadTriEngineExtractionInput(
  file: File,
  scanMode: ScanModeV5,
  userId: string,
  openAiModel?: string,
  engineRunMode: TriEngineRunMode = "AUTO",
  userInstruction?: string | null,
): Promise<TriEngineExtractionInput> {
  const bytes = await file.arrayBuffer();
  const base64 = Buffer.from(bytes).toString("base64");
  const rawMime = file.type || "application/octet-stream";
  const mimeType = inferMimeFromFileName(file.name, rawMime);

  const messages = await readRequestMessages();
  const locale = await getServerLocale();

  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      organization: { select: { industry: true, constructionTrade: true } },
    },
  });

  const industry = userRow?.organization?.industry ?? "CONSTRUCTION";
  const orgTrade = userRow?.organization?.constructionTrade ?? null;

  return {
    base64,
    mimeType,
    fileName: file.name,
    scanMode,
    locale,
    industry,
    orgTrade,
    messages,
    openAiModel,
    engineRunMode,
    userInstruction,
  };
}

export function mergeProjectClientIntoV5(
  v5: ScanExtractionV5,
  projectLabel: string | null,
  clientLabel: string | null,
): ScanExtractionV5 {
  if (!projectLabel && !clientLabel) return v5;
  return {
    ...v5,
    documentMetadata: {
      ...v5.documentMetadata,
      project: projectLabel ?? v5.documentMetadata.project,
      client: clientLabel ?? v5.documentMetadata.client,
    },
  };
}

export function buildTriEngineAiDataRecord(
  v5Merged: ScanExtractionV5,
  telemetry: TriEngineTelemetry,
): Record<string, unknown> {
  return {
    ...v5ToPersistableAiData(v5Merged),
    _triEngineTelemetry: telemetry,
    _v5: v5Merged,
  };
}

export async function persistTriEngineToErp(params: {
  file: File;
  aiData: Record<string, unknown>;
  userId: string;
  organizationId: string;
}): Promise<{ documentId: string; priceSpikes: PriceSpikeAlert[] }> {
  const { file, aiData, userId, organizationId } = params;

  const doc = await prisma.document.create({
    data: {
      fileName: file.name,
      type: String(aiData.docType ?? "UNKNOWN"),
      status: "PROCESSED",
      aiData: aiData as Prisma.InputJsonValue,
      userId,
      organizationId,
    },
  });

  await persistDocumentLineItemsFromAiData(
    doc.id,
    organizationId,
    typeof aiData.vendor === "string" ? aiData.vendor : null,
    aiData,
    {
      notifyUserId: userId,
      fileLabel: file.name,
    },
  );

  const priceSpikes = await detectAndNotifyPriceSpikes({
    organizationId,
    userId,
    documentId: doc.id,
    aiData,
  });

  const emailRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (emailRow?.email) {
    await sendDocNotification(
      emailRow.email,
      String(aiData.vendor ?? "ספק כללי"),
      Number(aiData.total ?? 0),
    );
  }

  return { documentId: doc.id, priceSpikes };
}

async function detectAndNotifyPriceSpikes(params: {
  organizationId: string;
  userId: string;
  documentId: string;
  aiData: Record<string, unknown>;
}): Promise<PriceSpikeAlert[]> {
  const { organizationId, userId, documentId, aiData } = params;
  try {
    const allSpikes = await getPriceSpikeAlerts(organizationId, 32);
    if (allSpikes.length === 0) return [];

    const relevant = filterAlertsForScan(allSpikes, aiData);
    if (relevant.length === 0) return [];

    const top = relevant[0]!;
    const moreCount = relevant.length - 1;
    const title = `⚠️ זוהתה קפיצת מחיר בסריקה`;
    const bodyLead = `${top.description}: +${top.changePercent.toFixed(1)}% (₪${top.previousPrice.toFixed(2)} → ₪${top.latestPrice.toFixed(2)})`;
    const body = moreCount > 0 ? `${bodyLead} ועוד ${moreCount} פריטים` : bodyLead;

    await prisma.inAppNotification.create({
      data: {
        userId,
        title,
        body,
      },
    });
    void documentId;

    return relevant;
  } catch {
    return [];
  }
}

export function triEngineNdjsonErrorResponse(
  status: number,
  payload: { error: string; code?: string; resetAt?: Date },
): Response {
  return new Response(JSON.stringify({ type: "error", ...payload }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}
