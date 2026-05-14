import type { AppLocale } from "./config";

/** תגי Intl לפורמט תאריך/מספר לפי שפת ממשק */
export function intlLocaleForApp(locale: AppLocale): string {
  switch (locale) {
    case "he":
      return "he-IL";
    case "ru":
      return "ru-RU";
    default:
      return "en-US";
  }
}
