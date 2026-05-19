import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonBadRequest } from "@/lib/api-json";
import { runAiChat } from "@/lib/ai-chat";
import { getServerLocale } from "@/lib/i18n/server";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const MAX_REQUIREMENT = 4000;
const MAX_SOURCE_CHARS = 8000;

const bodySchema = z.object({
  requirement: z.string().min(1).max(MAX_REQUIREMENT),
  notebookTitle: z.string().max(200).optional(),
  sources: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        content: z.string().max(50_000),
      }),
    )
    .max(30)
    .optional(),
});

export const POST = withWorkspacesAuth(
  async (_req, _ctx, data) => {
    try {
      const requirement = data.requirement.trim();
      if (!requirement) {
        return jsonBadRequest("נא לתאר את המסמך הנדרש.", "missing_requirement");
      }

      const locale = await getServerLocale();
      const sourceBlock =
        data.sources
          ?.map((s) => {
            const body = s.content.slice(0, MAX_SOURCE_CHARS);
            return `### ${s.name}\n${body}`;
          })
          .join("\n\n")
          .slice(0, MAX_SOURCE_CHARS * 3) ?? "";

      const contextJson = JSON.stringify({
        task: "notebook_issue_document",
        notebookTitle: data.notebookTitle ?? "מחברת BSD-YBM",
        rules: [
          "הפק מסמך עסקי מלא בעברית לפי דרישת המשתמש.",
          "השתמש במקורות המצורפים כבסיס — אל תמציא נתונים שלא מופיעים בהם.",
          "מבנה: כותרת, תאריך (אם רלוונטי), גוף מסודר, סיכום/חתימה אם מתאים.",
          "אין ייעוץ משפטי/מס מחייב — טיוטה עסקית בלבד.",
          "אם חסר מידע — ציין הנחות מפורשות בסוף.",
        ],
        sources: sourceBlock || "(אין מקורות — הפק לפי הדרישה בלבד)",
      });

      const { text, provider } = await runAiChat(undefined, requirement, contextJson, locale);
      const documentText = (text ?? "").trim();
      if (!documentText) {
        return jsonBadRequest("לא התקבל תוכן מסמך מה-AI", "empty_document");
      }

      const safeTitle =
        data.notebookTitle?.trim().slice(0, 40) ||
        requirement.slice(0, 40).replace(/[^\p{L}\p{N}\s-]/gu, "").trim() ||
        "מסמך-ממחברת";

      return NextResponse.json({
        text: documentText,
        suggestedFileName: `${safeTitle}.md`,
        provider,
      });
    } catch (err: unknown) {
      return apiErrorResponse(err, "api/notebooklm/generate-document");
    }
  },
  { schema: bodySchema },
);
