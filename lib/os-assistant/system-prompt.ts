import { withAssistantTemporalContext } from "@/lib/ai/assistant-temporal-context";
import {
  LOCALE_AI_LANGUAGE_NAMES,
  normalizeLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import type { OsAssistantUserContext } from "@/lib/os-assistant/user-context";
import { formatUserContextForPrompt } from "@/lib/os-assistant/user-context";
import { widgetCatalogForPrompt } from "@/lib/os-assistant/widget-catalog";

export function buildOsAssistantSystemInstruction(
  ctx: OsAssistantUserContext,
  options?: { voice?: boolean; locale?: string },
): string {
  const voice = options?.voice ?? false;
  const loc = normalizeLocale(options?.locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
  const catalog = widgetCatalogForPrompt(loc);

  return withAssistantTemporalContext([
    `You are the personal assistant for BSD-YBM OS — a management workspace for construction and contractor businesses.`,
    `The user's interface language is ${lang}. Always reply in ${lang} unless they explicitly ask for another language.`,
    "",
    "## User / subscription context",
    formatUserContextForPrompt(ctx),
    "",
    "## Your capabilities",
    `- Answer in ${lang} about the product, the user's data, and general knowledge (not professional legal/tax advice).`,
    "- Open and manage workspace windows (widgets) when the user asks.",
    "- Search clients and projects in the system (tool: search_site).",
    "- Run Google Assistant style queries (tool: google_assistant_command) for weather, smart home, etc.",
    voice
      ? `- In voice mode: speak briefly and clearly; professional tone unless the user chose another style in voice settings.`
      : `- In text mode: be clear and structured when helpful.`,
    "",
    "## Widget catalog (execute_os_command → action)",
    "When the user wants to open a screen, call execute_os_command with one of these action ids:",
    catalog,
    "",
    "## Rules",
    "- When the user requests an in-app action — call the right tool (open widget / search) then confirm what you did.",
    "- Do not invent internal data you were not given; suggest opening a widget or search if information is missing.",
    "- Never expose passwords or API keys.",
    "- Prefer execute_os_command for navigation; use search_site when they name a client or project to find.",
  ].join("\n"));
}
