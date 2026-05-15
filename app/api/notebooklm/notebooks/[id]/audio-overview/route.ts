import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  jsonBadRequest,
  jsonNotFound,
  jsonServiceUnavailable,
  jsonUnauthorized,
} from "@/lib/api-json";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { GEMINI_NOTEBOOKLM_DEFAULT_MODEL } from "@/lib/gemini-model";
import { getAssistantNowDisplayHe } from "@/lib/ai/assistant-temporal-context";
import { getNotebookForUser, serializeNotebook, upsertAudioOverview } from "@/lib/notebooklm-db";

const MODEL = process.env.GEMINI_NOTEBOOKLM_MODEL?.trim() || GEMINI_NOTEBOOKLM_DEFAULT_MODEL;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  if (!isGeminiConfigured()) {
    return jsonServiceUnavailable(
      "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY.",
      "gemini_not_configured",
    );
  }

  const { id } = await params;
  const nb = await getNotebookForUser(session.user.id, id);
  if (!nb) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

  const body = (await req.json().catch(() => ({}))) as { scriptText?: string };
  let scriptText = typeof body.scriptText === "string" ? body.scriptText.trim() : "";

  if (!scriptText) {
    if (nb.sources.length === 0) {
      return jsonBadRequest("הוסף מקורות לפני יצירת סקירה קולית.", "no_sources");
    }

    const sourcesContext = nb.sources
      .map((s: { name: string; content: string }, i: number) => `מקור ${i + 1} (${s.name}):\n${s.content.slice(0, 12000)}\n`)
      .join("\n");

    const { text } = await generateText({
      model: google(MODEL),
      prompt: `אתה מנחה פודקאסט בעברית. תאריך התייחסות: ${getAssistantNowDisplayHe()}.
צור תסריט דיאלוגי קצר (2–3 דקות דיבור) שמסכם את המסמכים הבאים בצורה חיה ומעניינת. אל תשתמש בכוכביות או בפורמט markdown. רק טקסט לדיבור.

${sourcesContext}`,
    });

    scriptText = text.trim();
  }

  if (!scriptText) {
    return jsonBadRequest("לא נוצר תסריט.", "empty_script");
  }

  await upsertAudioOverview(id, session.user.id, scriptText);
  const updated = await getNotebookForUser(session.user.id, id);
  if (!updated) return jsonNotFound("המחברת לא נמצאה.", "notebook_not_found");

  return NextResponse.json({
    scriptText,
    notebook: serializeNotebook(updated),
  });
}
