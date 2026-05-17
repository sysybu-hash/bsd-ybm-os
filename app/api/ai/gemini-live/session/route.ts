import { GoogleGenAI, Modality } from "@google/genai";
import { NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 80;

async function createLiveAuthToken(client: GoogleGenAI, model: string) {
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

  const token = await client.authTokens.create({
    config: {
      uses: 1,
      expireTime,
      newSessionExpireTime,
      liveConnectConstraints: {
        model,
        config: {
          sessionResumption: {},
          temperature: 0.7,
          responseModalities: [Modality.AUDIO],
        },
      },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });

  return {
    token: token.name,
    model,
    expiresAt: expireTime,
    newSessionExpiresAt: newSessionExpireTime,
  };
}

export const POST = withWorkspacesAuth(async (_req, { orgId, userId }) => {
  try {
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

    const client = new GoogleGenAI({ apiKey: getGeminiApiKey() });
    let lastError: unknown;

    for (const model of GEMINI_LIVE_MODEL_FALLBACK_CHAIN) {
      try {
        return NextResponse.json(await createLiveAuthToken(client, model));
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
        console.warn(`[gemini-live] model ${model} unavailable, trying next`);
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
