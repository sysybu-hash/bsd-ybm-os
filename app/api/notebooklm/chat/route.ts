import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { google } from "@ai-sdk/google";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonServerError,
  jsonServiceUnavailable,
  jsonTooManyRequests,
  jsonUnauthorized,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { checkRateLimit } from "@/lib/rate-limit";

export const maxDuration = 120;

const MODEL = process.env.GEMINI_NOTEBOOKLM_MODEL?.trim() || "gemini-1.5-flash";
const REQUESTS_PER_HOUR = 80;

export async function POST(req: Request) {
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

    const rateKey = `notebooklm-chat:user:${session.user.id}`;
    const rl = await checkRateLimit(rateKey, REQUESTS_PER_HOUR, 60 * 60 * 1000);
    if (!rl.success) {
      return jsonTooManyRequests(
        `הגבלת קצב. נסו שוב אחרי ${rl.resetAt.toISOString()}.`,
        "rate_limited",
        { resetAt: rl.resetAt },
      );
    }

    const { messages, sources } = (await req.json()) as {
      messages?: UIMessage[];
      sources?: Array<{ name?: string; content?: string }>;
    };

    const rawMessages = Array.isArray(messages) ? messages : [];
    if (rawMessages.length === 0) {
      return jsonBadRequest("חסרות הודעות (messages).", "missing_messages");
    }

    const src = Array.isArray(sources) ? sources : [];
    const sourcesContext = src
      .map((s: { name?: string; content?: string }, i: number) => `מקור ${i + 1} (${s.name ?? "ללא שם"}):\n${s.content ?? ""}\n`)
      .join("\n");

    const systemPrompt = `
      אתה עוזר מחקר חכם ומתקדם במערכת ההפעלה BSD-YBM OS.
      עליך לענות על שאלות המשתמש *אך ורק* על בסיס מקורות הידע הבאים שסופקו לך. 
      אם התשובה לא נמצאת במקורות, ציין זאת במפורש. ענה בעברית מקצועית וברורה.
      
      מקורות ידע זמינים:
      ${sourcesContext}
    `;

    const forModel: Array<Omit<UIMessage, "id">> = rawMessages.map((m) => {
      const { id: _id, ...rest } = m;
      return rest;
    });

    let modelMessages;
    try {
      modelMessages = await convertToModelMessages(forModel);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "המרת הודעות נכשלה.";
      return jsonBadRequest(msg.slice(0, 400), "message_conversion_failed");
    }

    const result = streamText({
      model: google(MODEL),
      system: systemPrompt,
      messages: modelMessages,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("Chat API Error:", error);
    return new Response(JSON.stringify({ error: "שגיאת שרת מול גוגל" }), { status: 500 });
  }
}
