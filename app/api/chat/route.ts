import { google } from "@ai-sdk/google";
import { env } from "@/lib/env";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonServiceUnavailable } from "@/lib/api-json";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { createLogger } from "@/lib/logger";

const log = createLogger("api/chat");
import { getGeminiModelId } from "@/lib/gemini-model";

export const maxDuration = 30;

const AGENT_MODEL =
  env.GEMINI_AGENT_MODEL?.trim() ||
  env.GOOGLE_GENERATIVE_AI_MODEL?.trim() ||
  getGeminiModelId();

const chatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, _ctx, data) => {
    try {
      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable(
          "Gemini לא מוגדר. הוסיפו GOOGLE_GENERATIVE_AI_API_KEY ל-.env.local",
          "gemini_not_configured",
        );
      }

      const rawMessages = data.messages as UIMessage[];

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

      const locale = await getServerLocale();
      const result = streamText({
        model: google(AGENT_MODEL),
        system: withAssistantTemporalContext(`You are a smart virtual assistant embedded in BSD-YBM OS.
Help users perform actions such as opening projects, issuing invoices, and general management.
When asked to perform an action, use the available tools.
${aiReplyLanguageRule(locale)}
Never expose internal reasoning or planning text to the user — only the final answer.`),
        messages: modelMessages,
        tools: {
          createProject: tool({
            description: "פותח פרויקט חדש במערכת",
            inputSchema: z.object({
              projectName: z.string().describe("השם של הפרויקט החדש"),
              location: z.string().optional().describe("מיקום הפרויקט (אופציונלי)"),
            }),
            execute: async ({ projectName, location }) => {
              log.info("tool:createProject", { projectName, location });
              const newProjectId = `PRJ-${Math.floor(Math.random() * 1000)}`;
              return {
                success: true,
                projectId: newProjectId,
                message: `הפרויקט ${projectName} נפתח בהצלחה במסד הנתונים`,
              };
            },
          }),
          generateInvoice: tool({
            description: "מפיק חשבונית חדשה ללקוח או לפרויקט",
            inputSchema: z.object({
              clientName: z.string().describe("שם הלקוח אליו מיועדת החשבונית"),
              amount: z.number().describe("סכום החשבונית בשקלים"),
            }),
            execute: async ({ clientName, amount }) => {
              log.info("tool:generateInvoice", { clientName, amount });
              return {
                success: true,
                invoiceNumber: `INV-${Date.now()}`,
                amount,
                message: `חשבונית על סך ${amount} ש"ח הופקה ונשלחה ל-${clientName}`,
              };
            },
          }),
        },
      });

      return result.toUIMessageStreamResponse({ sendReasoning: false });
    } catch (error) {
      return apiErrorResponse(error, "chat/agent");
    }
  },
  { schema: chatBodySchema },
);
