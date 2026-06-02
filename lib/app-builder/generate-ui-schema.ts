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

const TYPE_KEEP_INSTRUCTIONS: Partial<Record<AppBuilderUiSchema["type"], string>> = {
  composer:   "Keep type composer; you may add/remove/reorder blocks (dashboard, form, actions, text).",
  calendar:   "Keep type calendar; you may add/update/remove eventFields. To add time support add a field with type 'time'. To mark the date field use isDate:true.",
  kanban:     "Keep type kanban; you may add/remove columns and cardFields.",
  calculator: "Keep type calculator; you may update inputs, outputs, and formula strings.",
  checklist:  "Keep type checklist; you may add/remove/update items.",
  full_app:   "Keep type full_app; you may add/remove/update fields.",
  dashboard:  "Keep type dashboard; you may add/remove/update components and their dataConfig.",
};

export function buildRefinePrompt(userRequest: string, existing: AppBuilderUiSchema): string {
  const keepInstruction =
    TYPE_KEEP_INSTRUCTIONS[existing.type] ??
    `Keep the same app type (${existing.type}).`;

  return [
    `Refine the existing ${existing.type} app according to the user request.`,
    "Apply ONLY the requested changes; keep everything else intact.",
    keepInstruction,
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
