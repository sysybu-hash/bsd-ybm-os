import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { buildOsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { buildOsAssistantSystemInstruction } from "@/lib/os-assistant/system-prompt";

export const dynamic = "force-dynamic";

function mapProvider(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const p = raw.trim().toLowerCase();
  if (p === "claude") return "anthropic";
  return p;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { provider?: string; prompt?: string };
    const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

    if (!prompt) {
      return NextResponse.json({ error: "חסרה הודעה" }, { status: 400 });
    }

    const session = await getServerSession(authOptions);
    const ctx = await buildOsAssistantUserContext(session);
    const contextJson = ctx
      ? buildOsAssistantSystemInstruction(ctx)
      : `אתה העוזר האישי של BSD-YBM OS. ענה בעברית, קצר ומקצועי.`;

    const locale = await getServerLocale();
    const { text, provider } = await runAiChat(
      mapProvider(body.provider),
      prompt,
      contextJson,
      locale,
    );

    return NextResponse.json({
      reply: text || "לא התקבלה תשובה מהמנוע.",
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
