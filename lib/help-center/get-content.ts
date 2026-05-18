import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { HELP_CENTER_HE } from "@/lib/help-center/content.he";
import { HELP_CENTER_EN } from "@/lib/help-center/content.en";
import { HELP_CENTER_RU } from "@/lib/help-center/content.ru";
import type { HelpCenterData } from "@/lib/help-center/types";

const BY_LOCALE: Record<AppLocale, HelpCenterData> = {
  he: HELP_CENTER_HE,
  en: HELP_CENTER_EN,
  ru: HELP_CENTER_RU,
};

export function getHelpCenterContent(locale: string): HelpCenterData {
  return BY_LOCALE[normalizeLocale(locale)];
}
