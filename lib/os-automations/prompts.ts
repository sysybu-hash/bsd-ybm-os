import { automationCatalogForPrompt } from "@/lib/os-automations/catalog";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

export function buildParseActionTaskPrompt(locale: string, userMessage: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
  const catalog = automationCatalogForPrompt(locale);

  return [
    `You parse user commands for BSD-YBM OS into structured automation actions.`,
    `Reply language for the "reply" field: ${lang}.`,
    "",
    "## Available intents",
    catalog,
    "",
    "## Output rules",
    "Return JSON only (no markdown):",
    `{"reply":"short confirmation in ${lang}","actions":[{"intent":"intent_id","params":{}}]}`,
    "",
    "- Use create_invoice when user asks to create/generate an invoice with client and amount.",
    "  params: clientName, lineDescription, amount (number), currency (ILS default), docType (invoice|quote).",
    "- Use create_task when user asks to add a task/todo on the project board.",
    "  params: title (required), projectName, priority (low|medium|high), dueDate (YYYY-MM-DD), status (todo|in-progress|review|done), budget (number).",
    "- Use create_contact when user asks to add a new client/contact in CRM.",
    "  params: name (required), email, phone, notes.",
    "- Use scan_with_instructions when user wants to scan with special focus.",
    "  params: userInstruction, engineRunMode (AUTO default).",
    "- Use save_scan_to_notebook when user wants to save last scan to notebook (only if context implies scan done).",
    "- Use open_widget via intent open_widget with params.widgetId for simple navigation.",
    "- For meckano clock in/out use meckano_clock_in / meckano_clock_out.",
    "- Multiple actions allowed in order when needed.",
    "",
    `User message: «${userMessage}»`,
  ].join("\n");
}
