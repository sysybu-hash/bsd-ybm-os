import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";

export const dynamic = "force-dynamic";

function mapProvider(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const p = raw.trim().toLowerCase();
  if (p === "claude") return "anthropic";
  return p;
}

export async function POST(request: Request) {
  let locale = "he";
  try {
    locale = await getServerLocale();
    const body = (await request.json()) as { provider?: string; prompt?: string };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json({ error: getApiMessage("missing_message", locale) }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const ctx = await buildOsAssistantUserContext(session);
    const contextJson = ctx
      ? buildOsAssistantSystemInstruction(ctx, { locale })
      : `You are the BSD-YBM OS assistant. ${aiReplyLanguageRule(locale)}`;

    const { text, provider } = await runAiChat(
      mapProvider(body.provider),
      prompt,
      contextJson,
      locale,
    );

    return NextResponse.json({
      reply: text || getApiMessage("server_error", locale),
      provider,
    });
  } catch (err: unknown) {
    console.error("Chat API Error:", err);
    const message = getUserFacingAiErrorMessage(err);
    const lower = message.toLowerCase();
    const status =
      lower.includes("חסר") && lower.includes("api")
        ? 503
        : lower.includes("api key") || lower.includes("מפתח")
          ? 503
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
