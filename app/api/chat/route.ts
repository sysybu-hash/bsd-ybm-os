import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonTooManyRequests } from "@/lib/api-json";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CHAT_PER_HOUR = 120;

const chatBodySchema = z.object({
  provider: z.string().optional(),
  prompt: z.string().min(1),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .optional(),
});

function mapProvider(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const p = raw.trim().toLowerCase();
  if (p === "claude") return "anthropic";
  return p;
}

export const POST = withWorkspacesAuth(async (req, ctx, data) => {
  let locale = "he";
  try {
    locale = await getServerLocale();
    const prompt = data.prompt.trim();

    const rl = await checkRateLimit(`chat:user:${ctx.userId}`, CHAT_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(getApiMessage("rate_limited", locale));
    }

    const userRow = await prisma.user.findUnique({
      where: { id: ctx.userId },
      select: { email: true, name: true },
    });
    const assistantCtx = await buildOsAssistantUserContext({
      user: {
        id: ctx.userId,
        email: userRow?.email ?? undefined,
        name: userRow?.name ?? undefined,
        role: ctx.role,
        organizationId: ctx.orgId,
      },
    } as Session);
    const contextJson = assistantCtx
      ? buildOsAssistantSystemInstruction(assistantCtx, { locale })
      : `You are the BSD-YBM OS assistant. ${aiReplyLanguageRule(locale)}`;

    const { text, provider } = await runAiChat(mapProvider(data.provider), prompt, contextJson, locale);

    return NextResponse.json({
      reply: text || getApiMessage("server_error", locale),
      provider,
    });
  } catch (err: unknown) {
    const message = getUserFacingAiErrorMessage(err, locale);
    const lower = message.toLowerCase();
    const status =
      lower.includes("חסר") && lower.includes("api")
        ? 503
        : lower.includes("api key") || lower.includes("מפתח")
          ? 503
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}, { schema: chatBodySchema });
