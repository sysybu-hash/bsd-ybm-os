import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

/** סימן פנימי — לא להקריא; מפעיל ברכת פתיחה בהוראות המערכת */
export const GEMINI_LIVE_SESSION_START_TAG = "[BSD_SESSION_START]";

export function buildGeminiLiveSessionStartUserTurn(locale?: string, userName?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
  const name = userName?.trim();
  const nameHint = name ? ` The user's name is ${name}.` : "";

  if (loc === "en") {
    return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} Reply in ${lang}.`;
  }
  if (loc === "ru") {
    return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} Отвечай на ${lang}.`;
  }
  return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} ענה ב${lang}.`;
}
