import { GoogleGenAI, Modality } from "@google/genai";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonForbidden,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
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

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }
    if (!session.user.organizationId) {
      return jsonForbidden("Gemini Live זמין רק למשתמשים המשויכים לארגון.");
    }
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const rl = await checkRateLimit(
      `gemini-live-token:${session.user.organizationId}:${session.user.id}`,
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
        return Response.json(await createLiveAuthToken(client, model));
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
  } catch (error) {
    console.error("api/ai/gemini-live/session:", error);
    const message = error instanceof Error ? error.message : String(error);
    const blob = `${message} ${JSON.stringify(error)}`;
    if (isGeminiApiKeyError(error)) {
      return jsonServiceUnavailable(
        formatGeminiLiveUserMessage(blob),
        "gemini_api_key_invalid",
      );
    }
    return jsonServerError(message.slice(0, 500));
  }
}
