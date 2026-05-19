import { NextResponse } from "next/server";
import type { Session } from "next-auth";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonTooManyRequests } from "@/lib/api-json";
import {
  getUserFacingAiErrorMessage,
  runAiChat,
  runAiChatStreamingNative,
} from "@/lib/ai-chat";
import { chatWithAttachment } from "@/lib/ai-chat-vision";
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
  locale: z.enum(["he", "en", "ru"]).optional(),
  prompt: z.string().min(1),
  stream: z.boolean().optional(),
  attachmentBase64: z.string().optional(),
  attachmentMimeType: z.string().optional(),
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

async function buildChatContext(ctx: { userId: string; orgId: string; role: string }, locale: string) {
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
  return assistantCtx
    ? buildOsAssistantSystemInstruction(assistantCtx, { locale })
    : `You are the BSD-YBM OS assistant. ${aiReplyLanguageRule(locale)}`;
}

/** צ'אט JSON / SSE (וידג'טים ב-OS) */
export const POST = withWorkspacesAuth(async (req, ctx, data) => {
  let locale = "he";
  try {
    locale = data.locale ?? (await getServerLocale());
    const prompt = data.prompt.trim();
    const wantStream = data.stream === true;

    const rl = await checkRateLimit(`chat:user:${ctx.userId}`, CHAT_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(getApiMessage("rate_limited", locale));
    }

    const contextJson = await buildChatContext(ctx, locale);
    const providerArg = mapProvider(data.provider);

    if (data.attachmentBase64 && data.attachmentMimeType) {
      const visionPrompt = `${contextJson}\n\n${prompt}`;
      const text = await chatWithAttachment(visionPrompt, {
        data: data.attachmentBase64,
        mimeType: data.attachmentMimeType,
      });
      if (wantStream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk: text })}\n\n`));
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true, provider: "gemini" })}\n\n`),
            );
            controller.close();
          },
        });
        return new Response(stream, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
        });
      }
      return NextResponse.json({ reply: text, provider: "gemini" });
    }

    if (wantStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          try {
            const { provider } = await runAiChatStreamingNative(
              providerArg,
              prompt,
              contextJson,
              locale,
              async (chunk) => {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`),
                );
              },
            );
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ done: true, provider })}\n\n`),
            );
          } catch (err: unknown) {
            const message = getUserFacingAiErrorMessage(err, locale);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`),
            );
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
      });
    }

    const { text, provider } = await runAiChat(providerArg, prompt, contextJson, locale);

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
