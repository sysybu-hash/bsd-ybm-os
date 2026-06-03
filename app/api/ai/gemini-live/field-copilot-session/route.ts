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
import { getFieldCopilotLivePrompt } from "@/lib/field-copilot/instruction";
import { guardConstructionOnlyApi } from "@/lib/industry-api-guard";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 80;
const NEW_SESSION_EXPIRE_MS = 120 * 1000;
const log = createLogger("gemini-live-field-copilot-session");

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
    const blocked = await guardConstructionOnlyApi(orgId);
    if (blocked) return blocked;

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
      `gemini-live-field-copilot:${orgId}:${userId}`,
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
    const systemInstruction = getFieldCopilotLivePrompt(locale);

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    let lastError: unknown;

    for (const model of GEMINI_LIVE_MODEL_FALLBACK_CHAIN) {
      try {
        const payload = await createLiveAuthToken(client, model, settings, systemInstruction, advancedFeatures);
        log.info("field-copilot auth token created", { model, orgId });
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

    log.error("all models failed for field-copilot session", {
      error: lastError instanceof Error ? lastError.message : String(lastError),
    });
    return jsonServiceUnavailable("לא ניתן ליצור טוקן Gemini Live. נסה שוב.", "token_creation_failed");
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/ai/gemini-live/field-copilot-session");
  }
});
