import type { Session } from "next-auth";
import { runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { interpretDoneFallback } from "@/lib/i18n/ai-locale";
import { buildParseActionTaskPrompt } from "@/lib/os-automations/prompts";
import type { ParseActionResponse } from "@/lib/os-automations/types";
import { parseActionsJson } from "@/lib/os-automations/parse-response";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { prisma } from "@/lib/prisma";

export async function parseOsActionMessage(
  userId: string,
  orgId: string,
  role: string | undefined,
  message: string,
): Promise<ParseActionResponse & { error?: string }> {
  const locale = await getServerLocale();
  const trimmed = message.trim();
  if (!trimmed) {
    return { reply: "", actions: [], error: "חסרה הודעה" };
  }

  const userRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const session = {
    user: {
      id: userId,
      organizationId: orgId,
      role,
      email: userRow?.email ?? null,
    },
  } as Session;

  const assistantCtx = await buildOsAssistantUserContext(session);
  if (!assistantCtx) {
    return { reply: "", actions: [], error: "הקשר משתמש חסר" };
  }

  const base = buildOsAssistantSystemInstruction(assistantCtx, { locale });
  const task = buildParseActionTaskPrompt(locale, trimmed);
  const { text } = await runAiChat("gemini", trimmed, `${base}\n\n${task}`, locale);
  const parsed = parseActionsJson(text ?? "", locale);

  if (parsed) return parsed;

  return {
    reply: text?.trim() || interpretDoneFallback(locale),
    actions: [],
  };
}
