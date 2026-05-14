import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { jsonBadRequest, jsonUnauthorized, jsonServerError } from "@/lib/api-json";
import { getUserFacingAiErrorMessage, runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";

const MAX_BRIEF = 4000;

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return jsonUnauthorized();
    }

    const body = (await req.json()) as { brief?: unknown };
    const brief = typeof body.brief === "string" ? body.brief.trim().slice(0, MAX_BRIEF) : "";
    if (!brief) {
      return jsonBadRequest("נא לתאר את המסמך שאתה צריך.", "missing_brief");
    }

    const contextJson = JSON.stringify({
      task: "freeform_document_draft",
      audience: "logged_in_org_member",
      rules: [
        "הפק טיוטת מסמך עסקי בעברית ברורה.",
        "מבנה מומלץ: כותרת, הקשר קצר, סעיפים ממוספרים, סיכום פעולות מוצעות.",
        "אל תכלול ייעוץ משפטי, מס או רגולציה כהוראה מחייבת — רק טיוטה עסקית.",
        "אם חסר מידע — ציין הנחות מפורשות.",
      ],
    });

    const locale = await getServerLocale();
    const { text, provider } = await runAiChat(undefined, brief, contextJson, locale);

    return NextResponse.json({
      text: text || "",
      provider,
    });
  } catch (error) {
    console.error("api/ai/doc-draft", error);
    return jsonServerError(getUserFacingAiErrorMessage(error));
  }
}
