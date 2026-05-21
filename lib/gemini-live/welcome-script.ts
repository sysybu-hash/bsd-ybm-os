import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { formatHebrewGreetingName } from "@/lib/i18n/hebrew-neutral-address";

/** טקסט מדויק לברכת קול — קצר, ניטרלי */
export function buildLiveWelcomeSpeech(locale?: string, userName?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  const name = userName?.trim();

  if (loc === "en") {
    const n = name ? ` ${name}` : "";
    return `Hello${n}. I am the assistant from BSD-YBM. What would you like to do?`;
  }
  if (loc === "ru") {
    const n = name ? `, ${name}` : "";
    return `Здравствуйте${n}. Я помощник BSD-YBM. Что вы хотите сделать?`;
  }

  if (name) {
    return `שלום ${formatHebrewGreetingName(name)}. אני העוזר מבית BSD-YBM. מה תרצו לבצע?`;
  }
  return `שלום. אני העוזר מבית BSD-YBM. מה תרצו לבצע?`;
}

export function buildLiveWelcomeSystemHint(locale?: string, userName?: string): string {
  const exact = buildLiveWelcomeSpeech(locale, userName);
  return (
    `Speak ONLY this exact welcome once, in a warm natural tone, under 6 seconds total. ` +
    `Do not add topics, lists, or extra sentences. Exact wording: «${exact}»`
  );
}
