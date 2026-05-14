import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonNotFound,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { loadRecentBillOfQuantitiesContext } from "@/lib/load-recent-bill-of-quantities-context";
import { getTradeSpecializedPrompt } from "@/lib/trade-specialized-prompt";

export const maxDuration = 120;

const NOTEBOOK_MODEL =
  process.env.GEMINI_NOTEBOOK_MODEL?.trim() || "gemini-2.5-flash-lite";
const REQUESTS_PER_HOUR = 40;

type ChatStreamBody = {
  projectId?: string;
  messages?: UIMessage[];
  id?: string;
  trigger?: string;
  messageId?: string;
};

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const orgId = session.user.organizationId ?? "";
    if (!orgId) {
      return jsonBadRequest("נדרש ארגון (organizationId) לשיחה לפי פרויקט.", "no_organization");
    }

    const rateKey = `erp-notebook-stream:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    const body = (await req.json()) as ChatStreamBody;
    const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
    if (!projectId) {
      return jsonBadRequest("חסר projectId.", "missing_project_id");
    }

    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return jsonBadRequest("חסרות הודעות (messages).", "missing_messages");
    }

    const project = await prisma.project.findFirst({
      where: { id: projectId, organizationId: orgId },
      include: {
        contacts: { take: 1, orderBy: { createdAt: "asc" } },
        organization: { select: { constructionTrade: true } },
      },
    });
    if (!project) {
      return jsonNotFound("הפרויקט לא נמצא או אינו שייך לארגון.", "project_not_found");
    }

    const clientName = project.contacts[0]?.name ?? "לא שויך";
    const trade = project.organization?.constructionTrade ?? null;
    const specializedPrompt = getTradeSpecializedPrompt(trade);
    const boqContext = await loadRecentBillOfQuantitiesContext(orgId);

    let systemPrompt = `${specializedPrompt}

אתה מומחה פיננסי והנדסי המלווה את הפרויקט "${project.name}".
איש קשר/לקוח (ראשון): ${clientName}.
תפקידך לעזור למנהל הפרויקט לנתח הצעות מחיר, לזהות חריגות ולסכם נתונים.

התנהגות:
- ענה תמיד בעברית מקצועית, קצרה ועניינית.
- השתמש במונחים ההנדסיים המתאימים להתמחות הארגון (לפי ההנחיות למעלה).`;

    if (boqContext) {
      systemPrompt += `\n\n--- הקשר כמויות (BOQ) אחרונים בארגון (מסמכים סרוקים) ---\n${boqContext.slice(0, 12_000)}`;
    }

    const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });

    const modelMessages = await convertToModelMessages(forModel);

    const result = streamText({
      model: google(NOTEBOOK_MODEL),
      system: systemPrompt,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("project-notebook chat-stream:", error);
    const msg =
      error instanceof Error ? error.message : "מחברת פרויקט — שגיאת שרת.";
    return jsonServerError(msg.slice(0, 500));
  }
}
