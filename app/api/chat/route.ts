import { google } from "@ai-sdk/google";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { jsonBadRequest, jsonServiceUnavailable } from "@/lib/api-json";

export const maxDuration = 30;

const AGENT_MODEL =
  process.env.GEMINI_AGENT_MODEL?.trim() ||
  process.env.GOOGLE_GENERATIVE_AI_MODEL?.trim() ||
  "gemini-2.5-flash";

const chatBodySchema = z.object({
  messages: z.array(z.unknown()).min(1),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    if (!isGeminiConfigured()) {
      return jsonServiceUnavailable(
        "Gemini לא מוגדר. הוסיפו GOOGLE_GENERATIVE_AI_API_KEY ל-.env.local",
        "gemini_not_configured",
      );
    }

    const body = chatBodySchema.parse(await req.json());
    const rawMessages = body.messages as UIMessage[];

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
      model: google(AGENT_MODEL),
      system: `אתה עוזר וירטואלי חכם המוטמע באתר. 
    תפקידך לעזור למשתמשים לבצע פעולות במערכת כמו פתיחת פרויקטים, הפקת חשבוניות וניהול כללי. 
    אם מבקשים ממך לבצע פעולה, השתמש בכלים (Tools) שעומדים לרשותך. תמיד תענה בשפה העברית או לפי שפת המשתמש באתר.`,
      messages: modelMessages,
      tools: {
        createProject: tool({
          description: "פותח פרויקט חדש במערכת",
          inputSchema: z.object({
            projectName: z.string().describe("השם של הפרויקט החדש"),
            location: z.string().optional().describe("מיקום הפרויקט (אופציונלי)"),
          }),
          execute: async ({ projectName, location }) => {
            console.log(`יצירת פרויקט: ${projectName} במיקום: ${location}`);
            const newProjectId = `PRJ-${Math.floor(Math.random() * 1000)}`;
            return {
              success: true,
              projectId: newProjectId,
              message: `הפרויקט ${projectName} נפתח בהצלחה במסד הנתונים`,
            };
          },
        }),
        generateInvoice: tool({
          description: "מפיק חשבונית חדשה ללקוח או לפרויקט",
          inputSchema: z.object({
            clientName: z.string().describe("שם הלקוח אליו מיועדת החשבונית"),
            amount: z.number().describe("סכום החשבונית בשקלים"),
          }),
          execute: async ({ clientName, amount }) => {
            console.log(`מפיק חשבונית על סך ${amount} עבור ${clientName}`);
            return {
              success: true,
              invoiceNumber: `INV-${Date.now()}`,
              amount,
              message: `חשבונית על סך ${amount} ש"ח הופקה ונשלחה ל-${clientName}`,
            };
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return apiErrorResponse(error, "chat/agent");
  }
}
