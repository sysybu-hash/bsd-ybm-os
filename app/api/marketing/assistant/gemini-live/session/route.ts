import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { formatGeminiLiveUserMessage } from "@/lib/gemini-live-user-message";
import { checkRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  GEMINI_LIVE_MODEL_FALLBACK_CHAIN,
  isGeminiApiKeyError,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import {
  buildFullLiveConnectConfig,
  normalizeSessionRequest,
} from "@/lib/gemini-live-session-config";
import { normalizeLocale } from "@/lib/i18n/config";
import { buildMarketingLandingSystemInstruction } from "@/lib/marketing/landing-assistant-prompt";
import { MARKETING_LIVE_MAX_SECONDS } from "@/lib/marketing/live-constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 25;
const NEW_SESSION_EXPIRE_MS = MARKETING_LIVE_MAX_SECONDS * 1000;
const log = createLogger("marketing-gemini-live-session");

async function createLiveAuthToken(
  client: GoogleGenAI,
  model: string,
  settings: GeminiLiveVoiceSettings,
  systemInstruction: string,
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
          advancedFeatures: false,
          model,
          includeTools: false,
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
    maxSessionSeconds: MARKETING_LIVE_MAX_SECONDS,
    responseMode: settings.responseMode,
    embeddedSetup: true,
    systemInstructionLength: systemInstruction.length,
  };
}

export async function POST(req: NextRequest) {
  try {
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini Live אינו זמין כרגע.",
        "gemini_not_configured",
      );
    }

    const rlKey = getRateLimitKey(req, "marketing:gemini-live");
    const rl = await checkRateLimit(rlKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        "הגבלת קצב לשיחה קולית. נסו שוב מאוחר יותר.",
        "rate_limited",
        { resetAt: rl.resetAt.toISOString() },
      );
    }

    let sessionBody: unknown = {};
    try {
      sessionBody = await req.json();
    } catch {
      sessionBody = {};
    }
    const raw =
      sessionBody && typeof sessionBody === "object"
        ? (sessionBody as Record<string, unknown>)
        : {};
    const locale = normalizeLocale(typeof raw.locale === "string" ? raw.locale : undefined);
    const { settings } = normalizeSessionRequest(sessionBody);

    const systemInstruction = buildMarketingLandingSystemInstruction(locale, "voice");

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    let lastError: unknown;

    for (const model of GEMINI_LIVE_MODEL_FALLBACK_CHAIN) {
      try {
        const payload = await createLiveAuthToken(client, model, settings, systemInstruction);
        log.info("marketing live token created", {
          model,
          locale,
          maxSessionSeconds: MARKETING_LIVE_MAX_SECONDS,
        });
        return NextResponse.json(payload);
      } catch (error) {
        lastError = error;
        const blob = `${error instanceof Error ? error.message : String(error)}`;
        if (isGeminiApiKeyError(error)) {
          return jsonServiceUnavailable(formatGeminiLiveUserMessage(blob), "gemini_api_key_invalid");
        }
        if (!isLikelyGeminiModelUnavailable(error)) {
          throw error;
        }
      }
    }

    throw lastError ?? new Error("Gemini Live unavailable");
  } catch (err: unknown) {
    if (isGeminiApiKeyError(err)) {
      const message = err instanceof Error ? err.message : String(err);
      return jsonServiceUnavailable(formatGeminiLiveUserMessage(message), "gemini_api_key_invalid");
    }
    return apiErrorResponse(err, "api/marketing/assistant/gemini-live/session");
  }
}
