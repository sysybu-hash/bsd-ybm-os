"use server";

import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiModelFallbackChain, isLikelyGeminiModelUnavailable } from "@/lib/gemini-model";
import {
  assertProviderConfigured,
  normalizeAiProviderId,
  type AiProviderId,
} from "@/lib/ai-providers";
import { parseModelJsonText } from "@/lib/ai-document-json";
import { getServerLocale } from "@/lib/i18n/server";
import {
  getDocumentJsonInstruction,
  DOCUMENT_JSON_SCHEMA_VERSION,
} from "@/lib/i18n/ai-prompts";
import { extractDocumentWithOpenAI } from "@/lib/ai-extract-openai";
import { extractDocumentWithAnthropic } from "@/lib/ai-extract-anthropic";
import {
  checkAndDeductScanCredit,
  resolveOrganizationForUser,
} from "@/lib/quota-check";
import { scanCreditKindForProvider } from "@/lib/scan-credit-kind";
import { getAllowedAiProvidersForPlan } from "@/lib/ai-engine-access";
import { isAdmin } from "@/lib/is-admin";
import { readRequestMessages } from "@/lib/i18n/server-messages";
import { getMergedIndustryConfig } from "@/lib/construction-trades";
import type { ScanUsageWarningId } from "@/lib/decrement-scan";
import { sendDocNotification } from "./send-doc-notification";
import { persistDocumentLineItemsFromAiData } from "@/lib/persist-document-lines";
import {
  inferMimeFromFileName,
  isOpenAiAnthropicScanMime,
  isTextLikeMime,
  isDocxMime,
} from "@/lib/scan-mime";

function getGeminiKey(): string | undefined {
  return process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? process.env.GEMINI_API_KEY;
}

export type ProcessDocumentResult =
  | { success: true; data: unknown }
  | { success: false; error: string; code?: "QUOTA_EXCEEDED" };

/**
 * חילוץ מול Gemini עם קובץ בינארי אחד (למשל PDF שלם ב־base64).
 * אין פיצול לעמוד בודד בשרת — המודל מקבל את כל ה־PDF; ההנחיה ב־getDocumentJsonInstruction דורשת סריקת כל העמודים.
 */
async function extractWithGemini(
  base64Data: string,
  mimeType: string,
  documentInstruction: string,
): Promise<Record<string, unknown>> {
  const apiKey = getGeminiKey();
  if (!apiKey?.trim()) {
    throw new Error("חסר מפתח Gemini");
  }
  const genAI = new GoogleGenerativeAI(apiKey);

  const fallbackModels = getGeminiModelFallbackChain();

  let lastError: unknown = null;
  for (const modelId of fallbackModels) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([
        `${documentInstruction}`,
        { inlineData: { data: base64Data, mimeType } },
      ]);
      const text = result.response.text();
      return parseModelJsonText(text);
    } catch (err: unknown) {
      lastError = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }
  throw lastError;
}

async function extractWithGeminiText(
  plainText: string,
  fileName: string,
  documentInstruction: string,
): Promise<Record<string, unknown>> {
  const apiKey = getGeminiKey();
  if (!apiKey?.trim()) {
    throw new Error("חסר מפתח Gemini");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  const capped =
    plainText.length > 500_000
      ? `${plainText.slice(0, 500_000)}\n\n[…truncated for scan]`
      : plainText;
  const prompt = `${documentInstruction}\nFile name: ${fileName}\n\nDocument text:\n${capped}`;

  let lastError: unknown = null;
  for (const modelId of getGeminiModelFallbackChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent([prompt]);
      const text = result.response.text();
      return parseModelJsonText(text);
    } catch (err: unknown) {
      lastError = err;
      if (isLikelyGeminiModelUnavailable(err)) continue;
      throw err;
    }
  }
  throw lastError;
}

/** בוחר ספק בפועל: טקסט → Gemini טקסט; OpenAI/Claude רק לתמונות; אחרת Gemini קבצים */
function resolveScanProvider(
  requested: AiProviderId,
  mimeType: string,
): AiProviderId {
  if (isTextLikeMime(mimeType) || isDocxMime(mimeType)) {
    return "gemini";
  }
  if (requested === "groq") {
    return "gemini";
  }
  if (requested === "openai" || requested === "anthropic") {
    if (isOpenAiAnthropicScanMime(mimeType)) {
      return requested;
    }
    return "gemini";
  }
  return requested;
}

function sha256Hex(buffer: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buffer)).digest("hex");
}

function looksLikeAuthFailure(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes("api key") ||
    m.includes("401") ||
    m.includes("403") ||
    m.includes("permission_denied") ||
    m.includes("api_key_invalid") ||
    m.includes("invalid api key") ||
    m.includes("incorrect api key")
  );
}

function labelForScanProvider(id: AiProviderId): string {
  switch (id) {
    case "gemini":
      return "Google Gemini";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic Claude";
    case "docai":
      return "Google Document AI";
    default:
      return id;
  }
}

function authEnvHintForProvider(id: AiProviderId): string {
  switch (id) {
    case "gemini":
      return "ב-Vercel: GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY. ב-Google Cloud: חיוב פעיל והפעלת Gemini/Generative Language API.";
    case "openai":
      return "ב-Vercel: OPENAI_API_KEY (מפתח תקף, מכסה/ארגון). PDF דרך Responses — ברירת מחדל gpt-5.4-turbo; ניתן OPENAI_RESPONSES_MODEL / OPENAI_VISION_MODEL.";
    case "anthropic":
      return "ב-Vercel: ANTHROPIC_API_KEY.";
    case "docai":
      return "במסלול DocAI יש שני שלבים: OCR ב-Document AI ואז נורמליזציה ל-JSON דרך Gemini. ב-Vercel: GOOGLE_DOCUMENT_AI_PROCESSOR_ID, JSON של חשבון שירות ב-GOOGLE_DOCUMENT_AI_CREDENTIALS או ב-GOOGLE_APPLICATION_CREDENTIALS_JSON, וכן GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY. אם מופיע generativelanguage או Gemini בשגיאה — תקנו גישה ל-Generative Language API / מפתח / פרויקט.";
    default:
      return "בדקו מפתחות ב-Vercel וב-Google Cloud.";
  }
}

export async function processDocumentAction(
  formData: FormData,
  userId: string,
  orgId: string,
  persist: boolean = true,
): Promise<ProcessDocumentResult> {
  let effectiveProviderForError: AiProviderId | undefined;
  let requestedProviderForError: AiProviderId | undefined;

  try {
    const file = formData.get("file") as File | null;
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    const uiLocale = await getServerLocale();
    const uiMessages = await readRequestMessages();

    const requested = normalizeAiProviderId(formData.get("provider") as string | null);
    const rawMime = file.type || "application/octet-stream";
    const mimeType = inferMimeFromFileName(file.name, rawMime);

    const accessUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        email: true,
        role: true,
        organization: { select: { subscriptionTier: true, industry: true, constructionTrade: true } },
      },
    });
    const orgPlan = accessUser?.organization?.subscriptionTier ?? "FREE";
    const userIndustry = accessUser?.organization?.industry ?? "CONSTRUCTION";
    const orgTrade = accessUser?.organization?.constructionTrade ?? null;
    const analysisId = formData.get("analysisType") as string || "INVOICE";
    const rawScanModel = (formData.get("model") as string | null)?.trim();
    const scanModel =
      rawScanModel &&
      rawScanModel !== "docai-default" &&
      rawScanModel !== "default"
        ? rawScanModel
        : undefined;

    // Industry adaptation for AI instructions (בנייה + התמחות נלווית) — כולל תרגום UI כשיש
    const industryConfig = getMergedIndustryConfig(userIndustry, orgTrade, uiMessages);
    const analysisMode = industryConfig.scanner.analysisTypes.find((a: { id: string }) => a.id === analysisId);
    
    // Merge standard instructions with industry + mode specific tweaks
    const extraColumns = industryConfig.scanner.resultColumns
      .map((c: { key: string; label: string }) => `- "${c.key}": string | null (infer from context based on column label: '${c.label}')`)
      .join("\n");

    const documentInstruction = `${getDocumentJsonInstruction(uiLocale)}\n\n` +
      `### DYNAMIC EXTRA FIELDS\n` +
      `In addition to the exact shape above, you MUST ALSO include these fields at the root of the JSON object. Do not nest them. Use null if not found:\n` +
      `${extraColumns}\n\n` +
      `### PROFESSIONAL CONTEXT\n` +
      `**Industry**: ${industryConfig.label}\n` +
      `**Analysis Mode**: ${analysisMode?.label || analysisId}\n` +
      `**Mode Description**: ${analysisMode?.description || ""}\n` +
      (analysisMode?.promptExtra ? `**Special AI Focus**: ${analysisMode.promptExtra}\n` : "") +
      `\n${industryConfig.aiInstructions}`;

    const platformAiBypass = !!accessUser?.email && isAdmin(accessUser.email);
    const allowedProviders = getAllowedAiProvidersForPlan(orgPlan, platformAiBypass);

    let effectiveProvider = resolveScanProvider(requested, mimeType);
    if (!allowedProviders.includes(effectiveProvider)) {
      effectiveProvider = allowedProviders.includes("gemini")
        ? resolveScanProvider("gemini", mimeType)
        : resolveScanProvider(allowedProviders[0] ?? "gemini", mimeType);
    }

    const missingEff = assertProviderConfigured(effectiveProvider);
    if (missingEff) {
      return { success: false, error: missingEff };
    }

    requestedProviderForError = requested;
    effectiveProviderForError = effectiveProvider;

    const resolvedOrg = await resolveOrganizationForUser(orgId, userId);
    if (!resolvedOrg) {
      return { success: false, error: "לא נמצא ארגון למשתמש" };
    }
    const effectiveOrgId = resolvedOrg.id;

    const bytes = await file.arrayBuffer();
    const contentSha256 = sha256Hex(bytes);

    const cached = await prisma.documentScanCache.findUnique({
      where: {
        organizationId_contentSha256_providerUsed_locale_schemaVersion: {
          organizationId: effectiveOrgId,
          contentSha256,
          providerUsed: effectiveProvider,
          locale: uiLocale,
          schemaVersion: DOCUMENT_JSON_SCHEMA_VERSION,
        },
      },
    });

    let aiData: Record<string, unknown>;
    let fromCache = false;
    let usageWarnings: ScanUsageWarningId[] | undefined;

    if (cached?.resultJson && typeof cached.resultJson === "object") {
      aiData = cached.resultJson as Record<string, unknown>;
      fromCache = true;
    } else {
      const creditKind = scanCreditKindForProvider(effectiveProvider);
      const quota = await checkAndDeductScanCredit(orgId, userId, creditKind);
      if (!quota.allowed) {
        return {
          success: false,
          error: quota.error,
          code: "QUOTA_EXCEEDED",
        };
      }
      if (quota.usageWarnings?.length) {
        usageWarnings = quota.usageWarnings;
      }

      if (isTextLikeMime(mimeType)) {
        const decoder = new TextDecoder("utf-8");
        const plain = decoder.decode(bytes);
        aiData = await extractWithGeminiText(plain, file.name, documentInstruction);
      } else if (isDocxMime(mimeType)) {
        const mammoth = await import("mammoth");
        const buffer = Buffer.from(bytes);
        const result = await mammoth.extractRawText({ buffer });
        aiData = await extractWithGeminiText(result.value, file.name, documentInstruction);
      } else {
        const base64Data = Buffer.from(bytes).toString("base64");
        switch (effectiveProvider) {
          case "openai":
            aiData = await extractDocumentWithOpenAI(
              base64Data,
              mimeType,
              file.name,
              documentInstruction,
              scanModel,
            );
            break;
          case "anthropic":
            aiData = await extractDocumentWithAnthropic(
              base64Data,
              mimeType,
              file.name,
              documentInstruction,
              scanModel,
            );
            break;
          case "docai":
            const { extractDocumentWithDocAI } = await import("@/lib/ai-extract-docai");
            aiData = await extractDocumentWithDocAI(
              base64Data,
              mimeType,
              file.name,
              documentInstruction,
            );
            break;
          default:
            aiData = await extractWithGemini(base64Data, mimeType, documentInstruction);
        }
      }

      await prisma.documentScanCache.upsert({
        where: {
          organizationId_contentSha256_providerUsed_locale_schemaVersion: {
            organizationId: effectiveOrgId,
            contentSha256,
            providerUsed: effectiveProvider,
            locale: uiLocale,
            schemaVersion: DOCUMENT_JSON_SCHEMA_VERSION,
          },
        },
        create: {
          organizationId: effectiveOrgId,
          contentSha256,
          providerUsed: effectiveProvider,
          locale: uiLocale,
          schemaVersion: DOCUMENT_JSON_SCHEMA_VERSION,
          resultJson: aiData as Prisma.InputJsonValue,
        },
        update: {
          resultJson: aiData as Prisma.InputJsonValue,
        },
      });
    }

    const providerAdjusted = requested !== effectiveProvider;

    if (!persist) {
      return {
        success: true,
        data: {
          aiData,
          _provider: effectiveProvider,
          _requestedProvider: requested,
          _fromCache: fromCache,
          _providerAdjusted: providerAdjusted,
          _usageWarnings: usageWarnings,
        },
      };
    }

    const doc = await prisma.document.create({
      data: {
        fileName: file.name,
        type: String(aiData.docType ?? "UNKNOWN"),
        status: "PROCESSED",
        aiData: aiData as Prisma.InputJsonValue,
        userId,
        organizationId: effectiveOrgId,
      },
    });

    await persistDocumentLineItemsFromAiData(
      doc.id,
      effectiveOrgId,
      typeof aiData.vendor === "string" ? aiData.vendor : null,
      aiData,
      {
        skipPriceObservations: fromCache,
        notifyUserId: userId,
        fileLabel: file.name,
        skipNotification: fromCache,
      },
    );

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (user?.email && !fromCache) {
      await sendDocNotification(
        user.email,
        String(aiData.vendor ?? "ספק כללי"),
        Number(aiData.total ?? 0),
      );
    }

    return {
      success: true,
      data: {
        ...doc,
        _provider: effectiveProvider,
        _requestedProvider: requested,
        _fromCache: fromCache,
        _providerAdjusted: providerAdjusted,
        _usageWarnings: usageWarnings,
      },
    };
  } catch (error) {
    console.error("processDocumentAction error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    if (looksLikeAuthFailure(msg)) {
      const prov = effectiveProviderForError ?? "gemini";
      const req = requestedProviderForError ?? prov;
      const docAiGeminiNote =
        prov === "docai" &&
        (msg.includes("נורמליזציה עם Gemini") ||
          msg.toLowerCase().includes("generativelanguage") ||
          msg.includes("GoogleGenerativeAI"))
          ? "השגיאה בשלב Gemini (אחרי OCR של Document AI), לא בהכרח ב-Document AI עצמו. "
          : "";
      const routing =
        req !== prov
          ? `נשלח: ${labelForScanProvider(req)} · רץ בפועל: ${labelForScanProvider(prov)}. `
          : `מנוע: ${labelForScanProvider(prov)}. `;
      return {
        success: false,
        error: `בעיית הרשאה לספק ה-AI — ${routing}${docAiGeminiNote}${authEnvHintForProvider(prov)} פירוט טכני: ${msg.replace(/\s+/g, " ").slice(0, 220)}`,
      };
    }
    return {
      success: false,
      error: `פענוח נכשל: ${msg.slice(0, 280)}`,
    };
  }
}
