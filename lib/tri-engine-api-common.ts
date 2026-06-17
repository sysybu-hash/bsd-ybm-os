import type { Session } from "next-auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/is-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { checkAndDeductScanCredit, resolveOrganizationForUser } from "@/lib/quota-check";
import { readRequestMessages } from "@/lib/i18n/server-messages";
import { getServerLocale } from "@/lib/i18n/server";
import { inferMimeFromFileName } from "@/lib/scan-mime";
import type { ScanExtractionV5, ScanModeV5 } from "@/lib/scan-schema-v5";
import { v5ToPersistableAiData } from "@/lib/scan-schema-v5";
import type { TriEngineTelemetry } from "@/lib/tri-engine-types";
import type { TriEngineRunMode } from "@/lib/tri-engine-parse";

export type { ParsedTriEngineForm, TriEngineRunMode } from "@/lib/tri-engine-parse";
export {
  parseScanMode,
  parseTriEngineFormData,
  parseTriEngineRunMode,
  triEngineCreditKindFor,
  validateTriEngineRequest,
} from "@/lib/tri-engine-parse";
import { persistDocumentLineItemsFromAiData } from "@/lib/persist-document-lines";
import { sendDocNotification } from "@/app/actions/send-doc-notification";
import { resolveDocNotificationFields } from "@/lib/scan/notification-fields";
import { getPriceSpikeAlerts, type PriceSpikeAlert } from "@/lib/erp-price-spikes";
import { filterAlertsForScan } from "@/lib/scan-sync-summary";
import type { MessageTree } from "@/lib/i18n/keys";
import type { ScanUsageWarningId } from "@/lib/decrement-scan";
import { API_MSG_UNAUTHORIZED } from "@/lib/api-json";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";
import { archiveScanToDrive } from "@/lib/scan-archive-to-drive";
import { runScanInsights } from "@/lib/scan-insights";
import {
  getRecentCorrectionExamples,
  buildCorrectionPromptBlock,
} from "@/lib/scan-corrections-prompt";
import { notifyUser } from "@/lib/notify-user";

export const TRI_ENGINE_RATE_PER_HOUR = 40;
export const TRI_ENGINE_RATE_PER_HOUR_ADMIN = 120;
/** תיעוד בלבד — בנתיבי App Router חייבים `export const maxDuration = 300` כליטרל (לא ייבוא). */
export const TRI_ENGINE_MAX_DURATION_SEC = 300;

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

  // ── Step 9b: few-shot correction examples ───────────────────────────────
  const orgId = userRow?.organization
    ? (await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } }))?.organizationId ?? null
    : null;
  let correctionBlock = "";
  if (orgId) {
    const examples = await getRecentCorrectionExamples(orgId).catch(() => []);
    correctionBlock = buildCorrectionPromptBlock(examples);
  }

  const enrichedInstruction = correctionBlock
    ? `${correctionBlock}\n${userInstruction ?? ""}`.trim()
    : userInstruction ?? "";

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
    userInstruction: enrichedInstruction || null,
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
}): Promise<{ documentId: string; priceSpikes: PriceSpikeAlert[]; driveWebViewLink?: string | null; insights?: import("@/lib/scan-insights").ScanInsights | null }> {
  const { file, aiData, userId, organizationId } = params;

  // ── 1. שמירה ל-Google Drive (לא חוסמת — מכשל שקט אם Drive לא מחובר) ──────
  const driveResult = await archiveScanToDrive(userId, file);
  const fileDriveId = driveResult.ok ? driveResult.driveFileId : null;
  const fileDriveWebViewLink = driveResult.ok ? driveResult.driveWebViewLink : null;

  // ── 2. יצירת רשומת Document ב-DB ──────────────────────────────────────────
  const doc = await prisma.document.create({
    data: {
      fileName: file.name,
      type: String(aiData.docType ?? "UNKNOWN"),
      status: "PROCESSED",
      aiData: aiData as Prisma.InputJsonValue,
      fileDriveId,
      fileDriveWebViewLink,
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
    const notify = resolveDocNotificationFields(aiData);
    await sendDocNotification(emailRow.email, notify.vendor, notify.total, {
      extractionIncomplete: notify.extractionIncomplete,
    });
  }

  // ── 5. תובנות עסקיות (כפילויות, ספק↔פרויקט, תנאי תשלום) ──────────────────
  const insights = await runScanInsights({
    organizationId,
    vendor: String(aiData.vendor ?? ""),
    total: Number(aiData.total ?? 0),
    date: typeof aiData.date === "string" ? aiData.date : null,
    summary: typeof aiData.summary === "string" ? aiData.summary : "",
    documentId: doc.id,
  }).catch(() => null);

  return {
    documentId: doc.id,
    priceSpikes,
    driveWebViewLink: fileDriveWebViewLink,
    insights,
  };
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

    await notifyUser(userId, title, body);
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
