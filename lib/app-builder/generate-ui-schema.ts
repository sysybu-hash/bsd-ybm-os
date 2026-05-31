import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { APP_BUILDER_SYSTEM_PROMPT } from "@/lib/app-builder/system-prompt";
import {
  extractJsonFromModelText,
  parseAndSanitizeUiSchema,
} from "@/lib/app-builder/sanitize-ui-schema";
import { env } from "@/lib/env";
import { GEMINI_STABLE_TEXT_MODEL } from "@/lib/gemini-model";
import { aiReplyLanguageRule } from "@/lib/i18n/ai-locale";
import type { AppBuilderUiSchema } from "@/lib/validation/schemas/app-builder";

const MODEL = env.GEMINI_MODEL?.trim() || GEMINI_STABLE_TEXT_MODEL;

export function buildRefinePrompt(userRequest: string, existing: AppBuilderUiSchema): string {
  return [
    `Refine the existing ${existing.type} app according to the user request.`,
    "Apply ONLY the requested changes; keep other blocks/components/fields unless the user asked to change them.",
    existing.type === "composer"
      ? "Keep type composer; you may add/remove/reorder blocks (dashboard, form, actions, text)."
      : "Keep the same app type (form/table/dashboard/composer).",
    "For dashboard/composer dashboard blocks: metric_card uses count or sum correctly.",
    "Return the complete updated JSON only.",
    "",
    `User request: ${userRequest}`,
    "",
    `Current app JSON:\n${JSON.stringify(existing)}`,
  ].join("\n");
}
export async function generateUiSchemaFromPrompt(prompt: string, locale: string) {
  const system = `${APP_BUILDER_SYSTEM_PROMPT}\n\n${aiReplyLanguageRule(locale)}`;

  const { text } = await generateText({
    model: google(MODEL),
    system,
    prompt,
  });

  let parsed = extractJsonFromModelText(text);
  let sanitized = parseAndSanitizeUiSchema(parsed);

  if (!sanitized.ok) {
    const { text: retryText } = await generateText({
      model: google(MODEL),
      system: `${system}\n\nYour previous response was invalid. Return ONLY valid JSON matching the schema.`,
      prompt,
    });
    parsed = extractJsonFromModelText(retryText);
    sanitized = parseAndSanitizeUiSchema(parsed);
  }

  return sanitized;
}
