import type { Session } from "next-auth";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest, jsonTooManyRequests } from "@/lib/api-json";
import { checkRateLimit } from "@/lib/rate-limit";
import { runAiChat, getUserFacingAiErrorMessage } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { buildParseActionTaskPrompt } from "@/lib/os-automations/prompts";
import type { ParseActionResponse } from "@/lib/os-automations/types";
import { parseActionsJson, legacyOpenWidgetsToActions } from "@/lib/os-automations/parse-response";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export { legacyOpenWidgetsToActions };

const parseActionBodySchema = z.object({
  message: z.string().min(1),
});

export const POST = withWorkspacesAuth(
  async (_req, ctx, data) => {
    let locale = "he";
    try {
      locale = await getServerLocale();
      const message = data.message.trim();

      const rateKey = `parse-action:user:${ctx.userId}`;
      const rl = await checkRateLimit(rateKey, 60, 60 * 1000);
      if (!rl.success) {
        return jsonTooManyRequests(getApiMessage("rate_limited", locale));
      }

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
      if (!assistantCtx) return jsonBadRequest(getApiMessage("missing_message", locale));

      const base = buildOsAssistantSystemInstruction(assistantCtx, { locale });
      const task = buildParseActionTaskPrompt(locale, message);
      const { text } = await runAiChat("gemini", message, `${base}\n\n${task}`, locale);
      const parsed = parseActionsJson(text ?? "", locale);

      if (parsed) {
        return Response.json(parsed satisfies ParseActionResponse);
      }

      return Response.json({
        reply: text?.trim() || interpretDoneFallback(locale),
        actions: [],
      } satisfies ParseActionResponse);
    } catch (err) {
      console.error("parse-action:", err);
      return Response.json(
        { error: getUserFacingAiErrorMessage(err, locale), actions: [], reply: "" },
        { status: 500 },
      );
    }
  },
  { schema: parseActionBodySchema },
);
