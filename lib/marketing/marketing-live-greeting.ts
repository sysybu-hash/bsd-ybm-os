import { GEMINI_LIVE_SESSION_START_TAG } from "@/lib/gemini-live/session-greeting";
import { LOCALE_AI_LANGUAGE_NAMES, normalizeLocale, type AppLocale } from "@/lib/i18n/config";

/** ברכת פתיחה לדף שיווק — לא עוזר workspace מחובר */
export function buildMarketingLiveSessionStartUserTurn(locale?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const lang = LOCALE_AI_LANGUAGE_NAMES[loc] ?? "Hebrew";

  const hintByLocale: Record<AppLocale, string> = {
    he: `${GEMINI_LIVE_SESSION_START_TAG} ענה ב${lang}. אתה עוזר שיווקי ידידותי בדף הנחיתה (האורח לא מחובר). ברך בקצרה ובניחותא — הזמן לשאול על המוצר. אל תקריא כתובות אתר אלא אם נשאלת.`,
    en: `${GEMINI_LIVE_SESSION_START_TAG} Reply in ${lang}. You are a friendly public marketing assistant on the landing page (guest, not logged in). Greet briefly and invite questions about the product. Do not read URLs unless asked.`,
    ru: `${GEMINI_LIVE_SESSION_START_TAG} Отвечайте на ${lang}. Вы дружелюбный публичный ассистент на лендинге (гость). Коротко поприветствуйте. Без URL, если не спросили.`,
  };
  return hintByLocale[loc];
}

/** הנחיה לסיכום לפני סגירת השיחה (כ־20 שניות לפני הקיצוץ) */
export function buildMarketingLiveFarewellUserTurn(locale?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;

  const byLocale: Record<AppLocale, string> = {
    he: `[SESSION_WRAP_UP] השיחה נסגרת בעוד כ-20 שניות. סכם בשני משפטים בניחותא את ערך המוצר. אם מתאים — הזמן לפתוח חשבון, בלי לחזור על כתובת האתר.`,
    en: `[SESSION_WRAP_UP] Session closes in ~20 seconds. Two friendly sentences on product value. Invite signup only if natural — no URL unless needed.`,
    ru: `[SESSION_WRAP_UP] ~20 секунд до конца. Два дружелюбных предложения. Регистрация — только если уместно.`,
  };
  return byLocale[loc];
}
