/**
 * שפות ממשק רשמיות: עברית, אנגלית, רוסית.
 * ערבית הוסרה מממשק הבחירה — ערכי cookie ישנים (ar) מנורמלים לאנגלית.
 */
export const PRIMARY_UI_LOCALES = ["he", "en", "ru"] as const;

export type AppLocale = (typeof PRIMARY_UI_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en";

export const COOKIE_LOCALE = "bsd-locale";

/** שלוש השפות במתג השפה */
export const SELECTABLE_LOCALES: AppLocale[] = [...PRIMARY_UI_LOCALES];

/** @deprecated השתמשו ב־PRIMARY_UI_LOCALES */
export const SUPPORTED_LOCALES = PRIMARY_UI_LOCALES;

/** עברית בלבד RTL בשלוש השפות */
const RTL = new Set<AppLocale>(["he"]);

export function isRtlLocale(locale: string): boolean {
  return RTL.has(locale as AppLocale);
}

export function isSupportedLocale(code: string): code is AppLocale {
  return (PRIMARY_UI_LOCALES as readonly string[]).includes(code);
}

export function normalizeLocale(raw: string | undefined | null): AppLocale {
  if (!raw || typeof raw !== "string") return DEFAULT_LOCALE;
  const lower = raw.trim().toLowerCase();
  const base = lower.split("-")[0] ?? lower;
  if (base === "iw") return "he";
  /** תאימות לאחור: cookie ישן בערבית */
  if (base === "ar") return "en";
  if (isSupportedLocale(base)) return base;
  return DEFAULT_LOCALE;
}

export const LOCALE_LABELS: Record<AppLocale, string> = {
  he: "עברית",
  en: "English",
  ru: "Русский",
};

/** תיאור השפה לשימוש בהנחיות למודל AI (באנגלית) */
export const LOCALE_AI_LANGUAGE_NAMES: Record<AppLocale, string> = {
  he: "Hebrew",
  en: "English",
  ru: "Russian",
};
