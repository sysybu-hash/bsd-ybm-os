import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonForbidden,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { GEMINI_FLAGSHIP_MODEL } from "@/lib/gemini-model";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";

export const maxDuration = 90;

const MODEL = process.env.GEMINI_OMNI_VOICE_MODEL?.trim() || GEMINI_FLAGSHIP_MODEL;
const REQUESTS_PER_HOUR = 60;

function buildOmniVoiceSystemPrompt(locale: string): string {
  return withAssistantTemporalContext(`You are an intelligent voice assistant for BSD-YBM, a construction ERP.
The user speaks via microphone.

Voice conversation rules:
1. Answer briefly, clearly, and professionally.
2. Sound like a senior project manager.
3. Focus on the bottom line.
4. ${aiReplyLanguageRule(locale)}
5. No asterisks, bold, or headings — text is read aloud.

Capabilities (do not list unless asked): ERP invoices, CRM, Meckano attendance.

Goal: fast, accurate answers with current date when time is relevant.`);
}

type OmniBody = {
  messages?: UIMessage[];
  projectId?: string;
  id?: string;
  trigger?: string;
  messageId?: string;
};

export async function POST(req: Request) {
  let locale = "he";
  try {
    locale = await getServerLocale();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }
    if (!session.user.organizationId) {
      return jsonForbidden(getApiMessage("voice_org_only", locale));
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
    }

    const orgId = session.user.organizationId;
    const rateKey = `omni-voice:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(getApiMessage("rate_limited", locale), "rate_limited", { resetAt: rl.resetAt });
    }

    const body = (await req.json()) as OmniBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return jsonBadRequest(getApiMessage("missing_messages", locale), "missing_messages");
    }

    const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });

    const modelMessages = await convertToModelMessages(forModel);

    const result = streamText({
      model: google(MODEL),
      system: buildOmniVoiceSystemPrompt(locale),
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("api/ai/omni-voice:", error);
    const msg = error instanceof Error ? error.message : getApiMessage("server_error", locale);
    return jsonServerError(msg.slice(0, 500));
  }
}
