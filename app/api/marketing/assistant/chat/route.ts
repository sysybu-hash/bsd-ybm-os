import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runAiChat } from "@/lib/ai-chat";
import { isAnyAiChatProviderConfigured } from "@/lib/ai-providers";
import { jsonServiceUnavailable } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { PRIMARY_UI_LOCALES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { buildMarketingPublicUrls } from "@/lib/marketing/canonical-site";
import { buildMarketingLandingSystemInstruction } from "@/lib/marketing/landing-assistant-prompt";
import { sanitizeMarketingAssistantReply } from "@/lib/marketing/sanitize-marketing-reply";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const historyItemSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  locale: z.enum(PRIMARY_UI_LOCALES).optional(),
  history: z.array(historyItemSchema).max(10).optional(),
});

function formatHistory(
  history: z.infer<typeof historyItemSchema>[] | undefined,
): string {
  if (!history?.length) return "";
  return history
    .map((item) => `${item.role === "user" ? "User" : "Assistant"}: ${item.content}`)
    .join("\n");
}

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, "marketing:assistant:chat", 40, 60_000);
  if (limited) return limited;

  try {
    if (!isAnyAiChatProviderConfigured()) {
      return jsonServiceUnavailable(
        "שירות העוזר אינו זמין כרגע. נסו שוב מאוחר יותר.",
        "ai_not_configured",
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "גוף הבקשה אינו תקין." }, { status: 400 });
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "בקשה לא תקינה." }, { status: 400 });
    }

    const locale: AppLocale = normalizeLocale(parsed.data.locale);
    const systemContext = buildMarketingLandingSystemInstruction(locale, "chat");
    const historyBlock = formatHistory(parsed.data.history);
    const userPrompt = [
      historyBlock ? `Previous messages:\n${historyBlock}\n` : "",
      `User: ${parsed.data.message}`,
    ]
      .filter(Boolean)
      .join("\n");

    const { text, provider } = await runAiChat("gemini", userPrompt, systemContext, locale);
    const urls = buildMarketingPublicUrls();

    return NextResponse.json({
      text: sanitizeMarketingAssistantReply(text.trim() || "לא התקבלה תשובה."),
      provider,
      registerUrl: urls.register,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/marketing/assistant/chat");
  }
}
