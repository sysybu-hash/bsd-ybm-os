import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { buildLiveWelcomeSystemHint } from "@/lib/gemini-live/welcome-script";

/** סימן פנימי — לא להקריא; מפעיל ברכת פתיחה בהוראות המערכת */
export const GEMINI_LIVE_SESSION_START_TAG = "[BSD_SESSION_START]";

export function buildGeminiLiveSessionStartUserTurn(
  locale?: string,
  userName?: string,
  now?: Date,
): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";
  const name = userName?.trim();
  const nameHint = name ? ` The user's name is ${name}.` : "";
  const welcomeHint = buildLiveWelcomeSystemHint(locale, userName, now);

  if (loc === "en") {
    return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} Reply in ${lang}. ${welcomeHint}`;
  }
  if (loc === "ru") {
    return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} Отвечай на ${lang}. ${welcomeHint}`;
  }
  return `${GEMINI_LIVE_SESSION_START_TAG}${nameHint} ענה ב${lang}. ${welcomeHint}`;
}
