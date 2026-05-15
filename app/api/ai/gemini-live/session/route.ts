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
import { GEMINI_LIVE_NATIVE_AUDIO_MODEL } from "@/lib/gemini-model";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REQUESTS_PER_HOUR = 80;

function getGeminiApiKey(): string {
  return (
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
    process.env.GEMINI_API_KEY?.trim() ||
    ""
  );
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
    const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const newSessionExpireTime = new Date(Date.now() + 60 * 1000).toISOString();

    const token = await client.authTokens.create({
      config: {
        uses: 1,
        expireTime,
        newSessionExpireTime,
        liveConnectConstraints: {
          model: GEMINI_LIVE_NATIVE_AUDIO_MODEL,
          config: {
            sessionResumption: {},
            temperature: 0.7,
            responseModalities: [Modality.AUDIO],
          },
        },
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    return Response.json({
      token: token.name,
      model: GEMINI_LIVE_NATIVE_AUDIO_MODEL,
      expiresAt: expireTime,
      newSessionExpiresAt: newSessionExpireTime,
    });
  } catch (error) {
    console.error("api/ai/gemini-live/session:", error);
    const message = error instanceof Error ? error.message : String(error);
    const blob = `${message} ${JSON.stringify(error)}`;
    if (/API_KEY_INVALID|API key expired|renew the api key|invalid api key/i.test(blob)) {
      return jsonServiceUnavailable(
        formatGeminiLiveUserMessage(blob),
        "gemini_api_key_invalid",
      );
    }
    return jsonServerError(message.slice(0, 500));
  }
}
