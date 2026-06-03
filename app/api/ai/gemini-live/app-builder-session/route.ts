import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  GEMINI_LIVE_MODEL_FALLBACK_CHAIN,
  isGeminiApiKeyError,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { getPlatformConfig } from "@/lib/platform-settings";
import {
  buildFullLiveConnectConfig,
  normalizeSessionRequest,
} from "@/lib/gemini-live-session-config";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 80;
const NEW_SESSION_EXPIRE_MS = 120 * 1000;
const log = createLogger("gemini-live-app-builder-session");

/**
 * מסלול Gemini Live ייעודי למחולל האפליקציות.
 *
 * ההבדלים מ-/api/ai/gemini-live/session:
 * - פרומפט מערכת ממוקד ב-UI/JSX בלבד — ללא פעולות פלטפורמה (CRM, חשבוניות, סריקה וכו')
 * - לא בונה os-assistant user context (אין הרשאות לפעולות OS)
 * - מוכוון עצות קוליות בנושאי React, Tailwind, ועיצוב ממשק
 */
function buildAppBuilderSystemInstruction(locale: string): string {
  const langRule = aiReplyLanguageRule(locale);

  return [
    "You are a dedicated voice assistant for the BSD-YBM App Builder — an AI-powered UI generator.",
    "Your ONLY purpose is to help users build, design, and refine React + Tailwind UI components via voice.",
    "",
    "SCOPE — you may ONLY discuss:",
    "• React component design (hooks, state, effects, props)",
    "• Tailwind CSS classes and responsive design",
    "• UI/UX best practices for forms, tables, dashboards, kanban boards, charts, animations, clocks, games",
    "• Describing what to type in the text chat to generate or refine a component",
    "• Explaining what the currently generated app does and how to improve it",
    "• Suggesting visual improvements (colors, layout, spacing, RTL/LTR, accessibility)",
    "",
    "HARD LIMITS — you must NEVER:",
    "• Open CRM, create invoices, scan documents, open tasks, or perform any platform OS action",
    "• Access external services, APIs, or databases",
    "• Execute code on the user's behalf",
    "• Discuss topics unrelated to UI/component building",
    "",
    "VOICE BEHAVIOR:",
    "• Keep responses SHORT and SPOKEN — max 2-3 sentences unless explaining a concept",
    "• Do NOT read out JSX/code verbatim — describe it conceptually instead",
    "• When the user wants to apply a change, guide them to TYPE the request in the text chat",
    "• Example: 'Great idea! Try typing: add a dark purple gradient background to the clock face'",
    "",
    langRule,
  ].join("\n");
}

async function createLiveAuthToken(
  client: GoogleGenAI,
  model: string,
  settings: Parameters<typeof buildFullLiveConnectConfig>[0],
  systemInstruction: string,
  advancedFeatures: boolean,
) {
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + NEW_SESSION_EXPIRE_MS).toISOString();

  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model,
        config: buildFullLiveConnectConfig(settings, systemInstruction, {
          advancedFeatures,
          model,
        }),
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  return {
    token: token.name,
    model,
    expiresAt: expireTime,
    newSessionExpiresAt: newSessionExpireTime,
    responseMode: settings.responseMode,
    embeddedSetup: true,
  };
}

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  try {
    const platform = await getPlatformConfig();
    if (platform.maintenanceMode) {
      return jsonServiceUnavailable(
        platform.maintenanceMessage.trim() || "המערכת בתחזוקה. נסו שוב מאוחר יותר.",
        "maintenance_mode",
      );
    }
    if (!platform.featureFlags.geminiLiveEnabled) {
      return jsonServiceUnavailable("Gemini Live מושבת בהגדרות הפלטפורמה.", "gemini_live_disabled");
    }
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const rl = await checkRateLimit(
      `gemini-live-app-builder:${orgId}:${userId}`,
      REQUESTS_PER_HOUR,
      60 * 60 * 1000,
    );
    if (!rl.success) {
      const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt.getTime() - Date.now()) / 1000));
      return jsonTooManyRequests("הגבלת קצב ב-Gemini Live.", "rate_limited", {
        resetAt: rl.resetAt.toISOString(),
        retryAfter: retryAfterSec,
      });
    }

    let sessionBody: unknown = {};
    try { sessionBody = await req.json(); } catch { sessionBody = {}; }

    const { settings, advancedFeatures } = normalizeSessionRequest(sessionBody);
    const locale = await getServerLocale();
    const systemInstruction = buildAppBuilderSystemInstruction(locale);

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    let lastError: unknown;

    for (const model of GEMINI_LIVE_MODEL_FALLBACK_CHAIN) {
      try {
        const payload = await createLiveAuthToken(client, model, settings, systemInstruction, advancedFeatures);
        log.info("app-builder auth token created", { model, orgId });
        return NextResponse.json(payload);
      } catch (error) {
        lastError = error;
        if (isGeminiApiKeyError(error)) break;
        if (!isLikelyGeminiModelUnavailable(error)) break;
        log.warn("model unavailable, trying next", {
          model,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    log.error("all models failed for app-builder session", {
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return jsonServiceUnavailable("לא ניתן ליצור טוקן Gemini Live. נסה שוב.", "token_creation_failed");
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/ai/gemini-live/app-builder-session");
  }
});
