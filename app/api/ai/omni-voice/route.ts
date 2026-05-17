import { NextResponse } from "next/server";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServiceUnavailable, jsonTooManyRequests } from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { GEMINI_FLAGSHIP_MODEL } from "@/lib/gemini-model";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { apiErrorResponse } from "@/lib/api-route-helpers";

export const maxDuration = 90;

const MODEL = process.env.GEMINI_OMNI_VOICE_MODEL?.trim() || GEMINI_FLAGSHIP_MODEL;
const REQUESTS_PER_HOUR = 60;

const omniBodySchema = z.object({
  messages: z.array(z.custom<UIMessage>()).min(1),
  projectId: z.string().optional(),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

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

export const POST = withWorkspacesAuth(async (_req, { orgId }, data) => {
  let locale = "he";
  try {
    locale = await getServerLocale();

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
    }

    const rateKey = `omni-voice:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(getApiMessage("rate_limited", locale), "rate_limited", { resetAt: rl.resetAt });
    }

    const rawMessages = data.messages;
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

    const streamResponse = result.toUIMessageStreamResponse();
    return new NextResponse(streamResponse.body, {
      status: streamResponse.status,
      headers: streamResponse.headers,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/ai/omni-voice");
  }
}, { schema: omniBodySchema });
