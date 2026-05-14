import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonServerError } from "@/lib/api-json";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { subscriptionTiersPromptBlockHe } from "@/lib/subscription-tier-config";
import { prisma } from "@/lib/prisma";

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 8000;

type ChatMsg = { role?: string; content?: unknown };

function normalizeMessages(raw: unknown): ChatMsg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((message): message is ChatMsg => Boolean(message) && typeof message === "object")
    .slice(-MAX_MESSAGES);
}

function buildPromptFromMessages(messages: ChatMsg[]): string {
  const lines: string[] = [];
  for (const message of messages) {
    const content =
      typeof message.content === "string" ? message.content.trim().slice(0, MAX_CONTENT_LEN) : "";
    if (!content) continue;
    const role = message.role === "user" ? "משתמש" : "עוזר";
    lines.push(`${role}: ${content}`);
  }
  return lines.join("\n\n");
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { messages?: unknown; provider?: string };
    const messages = normalizeMessages(body.messages);
    const prompt = buildPromptFromMessages(messages);

    if (!prompt) {
      return jsonBadRequest("חסרה הודעה.", "missing_message");
    }

    const session = await getServerSession(authOptions);
    const displayName =
      session?.user?.name?.trim() || session?.user?.email?.trim() || "משתמש";
    const tiersHe = subscriptionTiersPromptBlockHe();

    let orgContext: { industry: string; constructionTrade: string } | null = null;
    if (session?.user?.organizationId) {
      const org = await prisma.organization.findUnique({
        where: { id: session.user.organizationId },
        select: { industry: true, constructionTrade: true },
      });
      if (org) {
        orgContext = {
          industry: org.industry || "CONSTRUCTION",
          constructionTrade: org.constructionTrade || "GENERAL_CONTRACTOR",
        };
      }
    }

    const contextJson = !session
      ? [
          "אתה העוזר החכם של BSD-YBM.",
          "התפקיד שלך להסביר למבקרים על המערכת, המנויים והיכולות.",
          tiersHe,
        ].join("\n\n")
      : orgContext
        ? JSON.stringify({
            audience: "logged_in_org_member",
            displayName,
            industry: orgContext.industry,
            constructionTrade: orgContext.constructionTrade,
            hint:
              "הארגון בענף הבנייה והמקצועות הנלווים — התאם דוגמאות (אתרים, ספקים, מסמכי שטח) לפי constructionTrade.",
            tiersHe,
          })
        : [
            `אתה העוזר האישי של ${displayName} במערכת BSD-YBM.`,
            "עזור לו לנהל את העסק ביעילות בלי להמציא נתונים שלא נמסרו.",
            tiersHe,
          ].join("\n\n");

    const locale = await getServerLocale();
    const { text, provider } = await runAiChat(body.provider, prompt, contextJson, locale);

    return NextResponse.json({
      text: text || "לא התקבלה תשובה מהמנוע.",
      provider,
    });
  } catch (error) {
    console.error("api/ai/chat", error);
    return jsonServerError(getUserFacingAiErrorMessage(error));
  }
}
