import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";

const SPEECH_BCP47: Record<AppLocale, string> = {
  he: "he-IL",
  en: "en-US",
  ru: "ru-RU",
};

export function localeToSpeechLang(locale?: string | null): string {
  const loc = normalizeLocale(locale ?? undefined);
  return SPEECH_BCP47[loc] ?? SPEECH_BCP47.en;
}
