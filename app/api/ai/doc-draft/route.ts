import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const MAX_BRIEF = 4000;

const docDraftBodySchema = z.object({
  brief: z.string().min(1).max(MAX_BRIEF),
});

export const POST = withWorkspacesAuth(
  async (_req, _ctx, data) => {
    try {
      const brief = data.brief.trim();
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
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/ai/doc-draft");
    }
  },
  { schema: docDraftBodySchema },
);
