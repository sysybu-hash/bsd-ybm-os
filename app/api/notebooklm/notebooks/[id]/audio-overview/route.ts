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
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

const MODEL = process.env.GEMINI_NOTEBOOKLM_MODEL?.trim() || GEMINI_NOTEBOOKLM_DEFAULT_MODEL;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const locale = await getServerLocale();
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return jsonUnauthorized();

  if (!isGeminiConfigured()) {
    return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
  }

  const { id } = await params;
  const nb = await getNotebookForUser(session.user.id, id);
  if (!nb) return jsonNotFound(getApiMessage("notebook_not_found", locale), "notebook_not_found");

  const body = (await req.json().catch(() => ({}))) as { scriptText?: string };
  let scriptText = typeof body.scriptText === "string" ? body.scriptText.trim() : "";

  if (!scriptText) {
    if (nb.sources.length === 0) {
      return jsonBadRequest(getApiMessage("no_sources", locale), "no_sources");
    }

    const sourcesContext = nb.sources
      .map(
        (s: { name: string; content: string }, i: number) =>
          `Source ${i + 1} (${s.name}):\n${s.content.slice(0, 12000)}\n`,
      )
      .join("\n");

    const refDate = loc === "he" ? getAssistantNowDisplayHe() : new Date().toISOString().slice(0, 10);

    const { text } = await generateText({
      model: google(MODEL),
      prompt: `You are a podcast host. Reference date: ${refDate}.
Write a short spoken dialogue script (2–3 minutes) that lively summarizes the documents below.
${aiReplyLanguageRule(locale)}
No asterisks or markdown — spoken text only in ${lang}.

${sourcesContext}`,
    });

    scriptText = text.trim();
  }

  if (!scriptText) {
    return jsonBadRequest(getApiMessage("empty_script", locale), "empty_script");
  }

  await upsertAudioOverview(id, session.user.id, scriptText);
  const updated = await getNotebookForUser(session.user.id, id);
  if (!updated) return jsonNotFound(getApiMessage("notebook_not_found", locale), "notebook_not_found");

  return NextResponse.json({
    scriptText,
    notebook: serializeNotebook(updated),
  });
}
