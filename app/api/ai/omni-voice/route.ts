import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonForbidden,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";
import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import { GEMINI_FLAGSHIP_MODEL } from "@/lib/gemini-model";

export const maxDuration = 90;

const MODEL = process.env.GEMINI_OMNI_VOICE_MODEL?.trim() || GEMINI_FLAGSHIP_MODEL;
const REQUESTS_PER_HOUR = 60;

const SYSTEM_PROMPT = withAssistantTemporalContext(`אתה עוזר קולי אינטליגנטי ומקצועי למערכת ERP של חברת בנייה (BSD-YBM).
המשתמש מדבר איתך דרך מיקרופון.

חוקי שיחה קולית:
1. ענה בקצרה, חדה ומקצועית.
2. דבר בביטחון של מנהל פרויקט בכיר.
3. התמקד בשורה התחתונה.
4. ענה בעברית טבעית.
5. בלי כוכביות, מודגש או כותרות — הטקסט מוקרא בקול.

יכולות (אל תפרט אלא אם נשאלת): חשבוניות ERP, CRM, נוכחות Meckano.

מטרה: תשובות מהירות ומדויקות עם התייחסות לתאריך הנוכחי כשהזמן רלוונטי.`);

type OmniBody = {
  messages?: UIMessage[];
  projectId?: string;
  id?: string;
  trigger?: string;
  messageId?: string;
};

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return jsonUnauthorized();
    }
    if (!session.user.organizationId) {
      return jsonForbidden("העוזר הקולי זמין רק למשתמשים המשויכים לארגון.");
    }

    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
        "gemini_not_configured",
      );
    }

    const orgId = session.user.organizationId;
    const rateKey = `omni-voice:org:${orgId}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    const body = (await req.json()) as OmniBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    if (rawMessages.length === 0) {
      return jsonBadRequest("חסרות הודעות (messages).", "missing_messages");
    }

    const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });

    const modelMessages = await convertToModelMessages(forModel);

    const result = streamText({
      model: google(MODEL),
      system: SYSTEM_PROMPT,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("api/ai/omni-voice:", error);
    const msg = error instanceof Error ? error.message : "שגיאת שרת.";
    return jsonServerError(msg.slice(0, 500));
  }
}
