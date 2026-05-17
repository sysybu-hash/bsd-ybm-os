import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonBadRequest,
  jsonServiceUnavailable,
  jsonTooManyRequests,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { GEMINI_NOTEBOOKLM_DEFAULT_MODEL } from "@/lib/gemini-model";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const MODEL =
  process.env.GEMINI_NOTEBOOKLM_MODEL?.trim() || GEMINI_NOTEBOOKLM_DEFAULT_MODEL;
const REQUESTS_PER_HOUR = 80;

const notebookChatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  sources: z
    .array(
      z.object({
        name: z.string().optional(),
        content: z.string().optional(),
      }),
    )
    .optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { userId }, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable(
          "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
          "gemini_not_configured",
        );
      }

      const rateKey = `notebooklm-chat:user:${userId}`;
      const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
      if (!rl.success) {
        return jsonTooManyRequests(
          `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
          "rate_limited",
          { resetAt: rl.resetAt },
        );
      }

      const rawMessages = data.messages as UIMessage[];
      const src = Array.isArray(data.sources) ? data.sources : [];
      const sourcesContext = src
        .map((s, i) => `מקור ${i + 1} (${s.name ?? "ללא שם"}):\n${s.content ?? ""}\n`)
        .join("\n");

      const systemPrompt = withAssistantTemporalContext(`
אתה עוזר מחקר חכם במערכת BSD-YBM OS.
ענה על שאלות המשתמש *אך ורק* על בסיס מקורות הידע שסופקו למטה.
אם התשובה לא במקורות — ציין במפורש. ענה בעברית מקצועית וברורה.

מקורות ידע זמינים:
${sourcesContext}
`);

      const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
        const { id: _id, ...rest } = m;
        return rest;
      });

      let modelMessages;
      try {
        modelMessages = await convertToModelMessages(forModel);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "המרת הודעות נכשלה.";
        return jsonBadRequest(msg.slice(0, 400), "message_conversion_failed");
      }

      const result = streamText({
        model: google(MODEL),
        system: systemPrompt,
        messages: modelMessages,
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      return apiErrorResponse(error, "notebooklm/chat");
    }
  },
  { schema: notebookChatBodySchema },
);
