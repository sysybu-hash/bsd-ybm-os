import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import {
  jsonNotFound,
  jsonServiceUnavailable,
  jsonTooManyRequests,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { loadRecentBillOfQuantitiesContext } from "@/lib/load-recent-bill-of-quantities-context";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { getTradeSpecializedPrompt } from "@/lib/trade-specialized-prompt";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";

export const maxDuration = 120;

const NOTEBOOK_MODEL =
  process.env.GEMINI_NOTEBOOK_MODEL?.trim() || "gemini-2.5-flash-lite";
const REQUESTS_PER_HOUR = 40;

const chatStreamBodySchema = z.object({
  projectId: z.string().min(1),
  messages: z.array(z.unknown()).min(1),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, data) => {
    let locale = "he";
    try {
      locale = await getServerLocale();

      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
      }

      const rateKey = `erp-notebook-stream:org:${orgId}`;
      const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
      if (!rl.success) {
        return jsonTooManyRequests(getApiMessage("rate_limited", locale), "rate_limited", { resetAt: rl.resetAt });
      }

      const projectId = data.projectId.trim();
      const rawMessages = data.messages as UIMessage[];

      const project = await prisma.project.findFirst({
        where: { id: projectId, organizationId: orgId },
        include: {
          contacts: { take: 1, orderBy: { createdAt: "asc" } },
          organization: { select: { constructionTrade: true } },
        },
      });
      if (!project) {
        return jsonNotFound(getApiMessage("project_not_found", locale), "project_not_found");
      }

      const clientName = project.contacts[0]?.name ?? getApiMessage("unassigned_client", locale);
      const trade = project.organization?.constructionTrade ?? null;
      const specializedPrompt = getTradeSpecializedPrompt(trade);
      const boqContext = await loadRecentBillOfQuantitiesContext(orgId);

      let systemPrompt = withAssistantTemporalContext(`${specializedPrompt}

You are a financial and engineering expert supporting project "${project.name}".
Primary contact/client: ${clientName}.
Help the project manager analyze quotes, spot anomalies, and summarize data.

Behavior:
- ${aiReplyLanguageRule(locale)}
- Use engineering terms appropriate to the organization's trade (see guidance above).`);

      if (boqContext) {
        systemPrompt += `\n\n--- Recent BOQ context from organization scans ---\n${boqContext.slice(0, 12_000)}`;
      }

      const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
        const { id: _id, ...rest } = m;
        return rest;
      });

      const modelMessages = await convertToModelMessages(forModel);

      const result = streamText({
        model: google(NOTEBOOK_MODEL),
        system: systemPrompt,
        messages: modelMessages,
      });

      return result.toUIMessageStreamResponse();
    } catch (error) {
      return apiErrorResponse(error, "project-notebook chat-stream");
    }
  },
  { schema: chatStreamBodySchema },
);
