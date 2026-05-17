import type { Session } from "next-auth";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { runAiChat, getUserFacingAiErrorMessage } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { buildParseActionTaskPrompt } from "@/lib/os-automations/prompts";
import { actionsToOpenWidgets, parseActionsJson } from "@/lib/os-automations/parse-response";
import type { AutomationAction } from "@/lib/os-automations/types";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { prisma } from "@/lib/prisma";
import type { WidgetType } from "@/hooks/use-window-manager";

export const dynamic = "force-dynamic";

type InterpretResult = {
  reply: string;
  openWidgets: WidgetType[];
  searchQuery: string | null;
  actions: AutomationAction[];
};

const interpretBodySchema = z.object({
  message: z.string().min(1),
});

export const POST = withWorkspacesAuth(
  async (_req, ctx, data) => {
    let locale = "he";
    try {
      locale = await getServerLocale();
      const message = data.message.trim();

      const userRow = await prisma.user.findUnique({
        where: { id: ctx.userId },
        select: { email: true },
      });
      const session = {
        user: {
          id: ctx.userId,
          organizationId: ctx.orgId,
          role: ctx.role,
          email: userRow?.email ?? null,
        },
      } as Session;

      const assistantCtx = await buildOsAssistantUserContext(session);
      if (!assistantCtx) {
        return jsonBadRequest(getApiMessage("missing_message", locale));
      }

      const base = buildOsAssistantSystemInstruction(assistantCtx, { locale });
      const task = buildParseActionTaskPrompt(locale, message);
      const { text } = await runAiChat("gemini", message, `${base}\n\n${task}`, locale);
      const parsed = parseActionsJson(text ?? "", locale);

      if (parsed) {
        return Response.json({
          reply: parsed.reply,
          openWidgets: actionsToOpenWidgets(parsed.actions),
          searchQuery: null,
          actions: parsed.actions,
        } satisfies InterpretResult);
      }

      return Response.json({
        reply: text?.trim() || interpretDoneFallback(locale),
        openWidgets: [] as WidgetType[],
        searchQuery: null,
        actions: [],
      } satisfies InterpretResult);
    } catch (err) {
      console.error("api/os/assistant/interpret:", err);
      return Response.json(
        { error: getUserFacingAiErrorMessage(err, locale) },
        { status: 500 },
      );
    }
  },
  { schema: interpretBodySchema },
);
