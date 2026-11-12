import type { MessageTree } from "@/lib/i18n/keys";
import { createTranslator } from "@/lib/i18n/translate";
import he from "@/messages/vmb.he.json";
import en from "@/messages/vmb.en.json";
import ru from "@/messages/vmb.ru.json";

export type VmbLocale = "he" | "en" | "ru";

const PACKS: Record<VmbLocale, MessageTree> = {
  he: he as unknown as MessageTree,
  en: en as unknown as MessageTree,
  ru: ru as unknown as MessageTree,
};

export function vmbMessages(locale: VmbLocale = "he"): MessageTree {
  return PACKS[locale];
}

/** Server-side translator for VMB pages (static, no request data). */
export function vmbT(locale: VmbLocale = "he") {
  return createTranslator(PACKS[locale]);
}
