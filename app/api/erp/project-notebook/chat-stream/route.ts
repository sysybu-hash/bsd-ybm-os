import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
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

type ChatStreamBody = {
  projectId?: string;
  messages?: UIMessage[];
  id?: string;
  trigger?: string;
  messageId?: string;
};

export async function POST(req: NextRequest) {
  let locale = "he";
  try {
    locale = await getServerLocale();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
    }

    const orgId = session.user.organizationId ?? "";
    if (!orgId) {
      return jsonBadRequest(getApiMessage("no_organization", locale), "no_organization");
    }

    const rateKey = `erp-notebook-stream:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(getApiMessage("rate_limited", locale), "rate_limited", { resetAt: rl.resetAt });
    }

    const body = (await req.json()) as ChatStreamBody;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return jsonBadRequest(getApiMessage("missing_project_id", locale), "missing_project_id");
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return jsonBadRequest(getApiMessage("missing_messages", locale), "missing_messages");
    }

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
    console.error("project-notebook chat-stream:", error);
    const msg = error instanceof Error ? error.message : getApiMessage("server_error", locale);
    return jsonServerError(msg.slice(0, 500));
  }
}
