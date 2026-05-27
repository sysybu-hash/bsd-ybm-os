import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { formatHebrewGreetingName } from "@/lib/i18n/hebrew-neutral-address";

const ISRAEL_TZ = "Asia/Jerusalem";

export type LiveWelcomeTimeOfDay = "morning" | "afternoon" | "evening" | "night";

/** שעה בישראל — לברכת זמן (בדיקות יכולות להעביר `now` קבוע). */
export function resolveLiveWelcomeTimeOfDay(now = new Date()): LiveWelcomeTimeOfDay {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: ISRAEL_TZ,
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "night";
}

function timeOfDayPhrase(locale: AppLocale, tod: LiveWelcomeTimeOfDay): string {
  if (locale === "en") {
    if (tod === "morning") return "Good morning";
    if (tod === "afternoon") return "Good afternoon";
    if (tod === "evening") return "Good evening";
    return "Hello";
  }
  if (locale === "ru") {
    if (tod === "morning") return "Доброе утро";
    if (tod === "afternoon") return "Добрый день";
    if (tod === "evening") return "Добрый вечер";
    return "Здравствуйте";
  }
  if (tod === "morning") return "בוקר טוב";
  if (tod === "afternoon") return "צהריים טובים";
  if (tod === "evening") return "ערב טוב";
  return "שלום";
}

/** טקסט מדויק לברכת קול — קצר, עם ברכת זמן ושם אופציונלי */
export function buildLiveWelcomeSpeech(
  locale?: string,
  userName?: string,
  now?: Date,
): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const tod = resolveLiveWelcomeTimeOfDay(now);
  const timePhrase = timeOfDayPhrase(loc, tod);
  const name = userName?.trim();

  if (loc === "en") {
    const n = name ? `, ${name}` : "";
    return `${timePhrase}${n}. I'm your BSD-YBM OS assistant. How can I help in your workspace?`;
  }
  if (loc === "ru") {
    const n = name ? `, ${name}` : "";
    return `${timePhrase}${n}. Я помощник BSD-YBM OS. Чем помочь в рабочей среде?`;
  }

  if (name) {
    const first = formatHebrewGreetingName(name);
    return `${timePhrase} ${first}. אני העוזר של BSD-YBM OS. במה לעזור בסביבת העבודה?`;
  }
  return `${timePhrase}. אני העוזר של BSD-YBM OS. במה לעזור בסביבת העבודה?`;
}

export function buildLiveWelcomeSystemHint(locale?: string, userName?: string, now?: Date): string {
  const exact = buildLiveWelcomeSpeech(locale, userName, now);
  return (
    `Speak ONLY this exact welcome once, in a warm natural tone, under 6 seconds total. ` +
    `Do not add topics, lists, or extra sentences. Exact wording: «${exact}»`
  );
}
