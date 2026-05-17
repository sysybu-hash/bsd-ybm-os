import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { subscriptionTiersPromptBlockHe } from "@/lib/subscription-tier-config";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const MAX_MESSAGES = 24;
const MAX_CONTENT_LEN = 8000;

const chatBodySchema = z.object({
  messages: z.array(z.unknown()).optional(),
  provider: z.string().optional(),
});

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

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, data) => {
    try {
      const messages = normalizeMessages(data.messages);
      const prompt = buildPromptFromMessages(messages);

      if (!prompt) {
        return NextResponse.json({ error: "חסרה הודעה." }, { status: 400 });
      }

      const [userRow, org] = await Promise.all([
        prisma.user.findUnique({
          where: { id: userId },
          select: { name: true, email: true },
        }),
        prisma.organization.findUnique({
          where: { id: orgId },
          select: { industry: true, constructionTrade: true },
        }),
      ]);

      const displayName = userRow?.name?.trim() || userRow?.email?.trim() || "משתמש";
      const tiersHe = subscriptionTiersPromptBlockHe();

      const contextJson = org
        ? JSON.stringify({
            audience: "logged_in_org_member",
            displayName,
            industry: org.industry || "CONSTRUCTION",
            constructionTrade: org.constructionTrade || "GENERAL_CONTRACTOR",
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
      const { text, provider } = await runAiChat(data.provider, prompt, contextJson, locale);

      return NextResponse.json({
        text: text || "לא התקבלה תשובה מהמנוע.",
        provider,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai/chat");
    }
  },
  { schema: chatBodySchema },
);
