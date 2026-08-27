import type { Session } from "next-auth";
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
import type { MessageTree } from "@/lib/i18n/keys";
import type { ScanUsageWarningId } from "@/lib/decrement-scan";
import { API_MSG_UNAUTHORIZED } from "@/lib/api-json";
import type { ScanCreditKind } from "@/lib/scan-credit-kind";
import {
  getRecentCorrectionExamples,
  buildCorrectionPromptBlock,
} from "@/lib/scan-corrections-prompt";

export const TRI_ENGINE_RATE_PER_HOUR = 40;
export const TRI_ENGINE_RATE_PER_HOUR_ADMIN = 120;
/** ׳×׳™׳¢׳•׳“ ׳‘׳׳‘׳“ ג€” ׳‘׳ ׳×׳™׳‘׳™ App Router ׳—׳™׳™׳‘׳™׳ `export const maxDuration = 300` ׳›׳׳™׳˜׳¨׳ (׳׳ ׳™׳™׳‘׳•׳). */
export const TRI_ENGINE_MAX_DURATION_SEC = 300;

export type TriEngineGateOk = {
  userId: string;
  orgId: string;
  organizationId: string;
  usageWarnings?: ScanUsageWarningId[];
  /**
   * true ׳›׳©׳‘׳™׳§׳©׳ ׳• ׳—׳™׳•׳‘ ׳₪׳¨׳׳™׳•׳ ׳׳ ׳׳›׳¡׳× ׳”׳₪׳¨׳™׳׳™׳•׳ ׳׳–׳׳”, ׳•׳™׳¨׳“׳ ׳• ׳׳•׳˜׳•׳׳˜׳™׳× ׳׳—׳™׳•׳‘ ׳–׳•׳.
   * ׳”׳§׳•׳¨׳ ׳׳©׳×׳׳© ׳‘׳–׳” ׳›׳“׳™ ׳׳“׳׳’ ׳¢׳ ׳׳ ׳•׳¢׳™ ׳₪׳¨׳׳™׳•׳ (Anthropic) ׳•׳׳”׳¡׳×׳₪׳§ ׳‘׳׳¡׳׳•׳ ׳”׳–׳•׳.
   */
  downgraded?: boolean;
};

export type TriEngineGateResult =
  | ({ ok: true } & TriEngineGateOk)
  | { ok: false; status: number; error: string; resetAt?: Date; code?: string };

export async function triEngineAuthorizeAndCharge(
  session: Session | null,
  scanCreditKind: ScanCreditKind,
  /** ׳›׳©׳”׳—׳™׳•׳‘ ׳”׳׳‘׳•׳§׳© ׳”׳•׳ ׳₪׳¨׳׳™׳•׳ ׳•׳”׳׳›׳¡׳” ׳׳–׳׳” ג€” ׳׳¨׳“׳× ׳׳•׳˜׳•׳׳˜׳™׳× ׳׳—׳™׳•׳‘ ׳–׳•׳ ׳‘׳׳§׳•׳ ׳׳—׳¡׳•׳. */
  allowPremiumDowngrade = true,
): Promise<TriEngineGateResult> {
  if (!session?.user?.id) {
    return { ok: false, status: 401, error: API_MSG_UNAUTHORIZED };
  }

  const orgId = session.user.organizationId ?? "";
  if (!orgId) {
    return { ok: false, status: 400, error: "׳׳ ׳ ׳׳¦׳ ׳׳¨׳’׳•׳" };
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
      error: "׳—׳¨׳’׳× ׳׳׳›׳¡׳× ׳¡׳¨׳™׳§׳•׳× Tri-Engine ׳׳©׳¢׳”",
      resetAt: rl.resetAt,
    };
  }

  const resolvedOrg = await resolveOrganizationForUser(orgId, session.user.id);
  if (!resolvedOrg) {
    return { ok: false, status: 400, error: "׳׳¨׳’׳•׳ ׳׳ ׳×׳§׳™׳" };
  }

  let quota = await checkAndDeductScanCredit(resolvedOrg.id, session.user.id, scanCreditKind);
  let downgraded = false;

  // Graceful downgrade: premium quota exhausted ג†’ charge a cheap scan instead and
  // signal the caller to skip premium engines (e.g. Anthropic for contracts).
  if (
    !quota.allowed &&
    quota.code === "QUOTA_EXCEEDED" &&
    scanCreditKind === "premium" &&
    allowPremiumDowngrade
  ) {
    const cheap = await checkAndDeductScanCredit(resolvedOrg.id, session.user.id, "cheap");
    if (cheap.allowed) {
      quota = cheap;
      downgraded = true;
    }
  }

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
    downgraded,
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
  customEngines?: string[];
  userInstruction?: string | null;
  /** false ׳›׳©׳™׳¨׳“׳ ׳• ׳׳—׳™׳•׳‘ ׳–׳•׳ ג€” ׳׳“׳׳’׳™׳ ׳¢׳ ׳׳ ׳•׳¢׳™ ׳₪׳¨׳׳™׳•׳ (Anthropic) ׳‘-AUTO. */
  allowPremiumEngines?: boolean;
};

export async function loadTriEngineExtractionInput(
  file: File,
  scanMode: ScanModeV5,
  userId: string,
  openAiModel?: string,
  engineRunMode: TriEngineRunMode = "AUTO",
  userInstruction?: string | null,
  allowPremiumEngines = true,
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

  // ג”€ג”€ Step 9b: few-shot correction examples ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€ג”€
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
    allowPremiumEngines,
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

export { persistTriEngineToErp } from "@/lib/scan/tri-engine-persist-erp";


export function triEngineNdjsonErrorResponse(
  status: number,
  payload: { error: string; code?: string; resetAt?: Date },
): Response {
  return new Response(JSON.stringify({ type: "error", ...payload }) + "\n", {
    status,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

