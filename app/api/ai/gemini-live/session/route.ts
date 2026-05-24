import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonServiceUnavailable,
  jsonTooManyRequests,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { formatGeminiLiveUserMessage } from "@/lib/gemini-live-user-message";
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
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { getServerLocale } from "@/lib/i18n/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 80;
const log = createLogger("gemini-live-session");

async function createLiveAuthToken(
  client: GoogleGenAI,
  model: string,
  settings: GeminiLiveVoiceSettings,
  systemInstruction: string,
  advancedFeatures: boolean,
) {
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model,
        config: buildFullLiveConnectConfig(settings, systemInstruction, { advancedFeatures }),
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
    systemInstructionLength: systemInstruction.length,
  };
}

export const POST = withWorkspacesAuth(async (req, { orgId, userId, role }) => {
  try {
    const platform = await getPlatformConfig();
    if (platform.maintenanceMode) {
      return jsonServiceUnavailable(
        platform.maintenanceMessage.trim() || "המערכת בתחזוקה. נסו שוב מאוחר יותר.",
        "maintenance_mode",
      );
    }
    if (!platform.featureFlags.geminiLiveEnabled) {
      return jsonServiceUnavailable(
        "Gemini Live מושבת בהגדרות הפלטפורמה.",
        "gemini_live_disabled",
      );
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const rl = await checkRateLimit(
      `gemini-live-token:${orgId}:${userId}`,
      REQUESTS_PER_HOUR,
      60 * 60 * 1000,
    );
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    let sessionBody: unknown = {};
    try {
      sessionBody = await req.json();
    } catch {
      sessionBody = {};
    }
    const { settings, advancedFeatures } = normalizeSessionRequest(sessionBody);
    const locale = await getServerLocale();

    const userRow = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const session = {
      user: {
        id: userId,
        organizationId: orgId,
        role,
        email: userRow?.email ?? null,
      },
    } as Session;

    const assistantCtx = await buildOsAssistantUserContext(session);
    const systemInstruction = assistantCtx
      ? buildOsAssistantSystemInstruction(assistantCtx, { voice: true, locale })
      : buildOsAssistantSystemInstruction(
          {
            user: {
              id: userId,
              name: "משתמש",
              email: userRow?.email ?? "",
              role,
              isPlatformAdmin: false,
            },
            organization: null,
            capabilities: { geminiLive: true, meckano: false },
          },
          { voice: true, locale },
        );

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    let lastError: unknown;

    for (const model of GEMINI_LIVE_MODEL_FALLBACK_CHAIN) {
      try {
        const payload = await createLiveAuthToken(
          client,
          model,
          settings,
          systemInstruction,
          advancedFeatures,
        );
        log.info("auth token created", {
          model,
          systemInstructionLength: payload.systemInstructionLength,
          responseMode: payload.responseMode,
        });
        return NextResponse.json(payload);
      } catch (error) {
        lastError = error;
        const blob = `${error instanceof Error ? error.message : String(error)} ${JSON.stringify(error)}`;
        if (isGeminiApiKeyError(error)) {
          return jsonServiceUnavailable(
            formatGeminiLiveUserMessage(blob),
            "gemini_api_key_invalid",
          );
        }
        if (!isLikelyGeminiModelUnavailable(error)) {
          throw error;
        }
        log.warn("live model unavailable, trying next", { model });
      }
    }

    throw lastError ?? new Error("כל מודלי Gemini Live נכשלו");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const blob = `${message} ${JSON.stringify(err)}`;
    if (isGeminiApiKeyError(err)) {
      return jsonServiceUnavailable(
        formatGeminiLiveUserMessage(blob),
        "gemini_api_key_invalid",
      );
    }
    return apiErrorResponse(err, "api/ai/gemini-live/session");
  }
});
