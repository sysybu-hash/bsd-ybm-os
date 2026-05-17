import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import {
  jsonBadRequest,
  jsonNotFound,
  jsonServiceUnavailable,
} from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { isGeminiConfigured } from "@/lib/ai-providers";
import { GEMINI_NOTEBOOKLM_DEFAULT_MODEL } from "@/lib/gemini-model";
import { getAssistantNowDisplayHe } from "@/lib/ai/assistant-temporal-context";
import { getNotebookForUser, serializeNotebook, upsertAudioOverview } from "@/lib/notebooklm-db";
import { getServerLocale } from "@/lib/i18n/server";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import { getApiMessage } from "@/lib/i18n/api-messages";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

const MODEL = process.env.GEMINI_NOTEBOOKLM_MODEL?.trim() || GEMINI_NOTEBOOKLM_DEFAULT_MODEL;

const audioOverviewBodySchema = z.object({
  scriptText: z.string().optional(),
});

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof audioOverviewBodySchema>(
  async (_req, { userId }, segment, data) => {
    let locale = "he";
    try {
      locale = await getServerLocale();
      const loc = normalizeLocale(locale) as AppLocale;
      const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "English";

      if (!isGeminiConfigured()) {
        return jsonServiceUnavailable(getApiMessage("gemini_not_configured", locale), "gemini_not_configured");
      }

      const { id } = await segment.params;
      const nb = await getNotebookForUser(userId, id);
      if (!nb) return jsonNotFound(getApiMessage("notebook_not_found", locale), "notebook_not_found");

      let scriptText = typeof data.scriptText === "string" ? data.scriptText.trim() : "";

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

      await upsertAudioOverview(id, userId, scriptText);
      const updated = await getNotebookForUser(userId, id);
      if (!updated) return jsonNotFound(getApiMessage("notebook_not_found", locale), "notebook_not_found");

      return NextResponse.json({
        scriptText,
        notebook: serializeNotebook(updated),
      });
    } catch (err) {
      return apiErrorResponse(err, "notebooklm/audio-overview");
    }
  },
  { schema: audioOverviewBodySchema },
);
