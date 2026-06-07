import { getMergedIndustryConfig } from "@/lib/construction-trades";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import type { MessageTree } from "@/lib/i18n/keys";

export function localeLang(locale: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  return LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
}

export function industryInstructionExtras(
  industry: string,
  trade: string | null,
  messages: MessageTree,
): string {
  const cfg = getMergedIndustryConfig(industry, trade, messages);
  const cols = cfg.scanner.resultColumns
    .map((c: { key: string; label: string }) => `- "${c.key}": string | null (${c.label})`)
    .join("\n");
  return `### DYNAMIC FIELDS\nInclude at root if missing:\n${cols}\n\n### CONTEXT\nIndustry: ${cfg.label}\n${cfg.aiInstructions}`;
}
