import { cookies } from "next/headers";
import { COOKIE_LOCALE, normalizeLocale, type AppLocale } from "./config";
import { getMessages } from "./load-messages";
import { createTranslator } from "./translate";

export async function getServerLocale(): Promise<AppLocale> {
  const jar = await cookies();
  return normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
}

export async function getServerTranslator() {
  const locale = await getServerLocale();
  const messages = getMessages(locale);
  return {
    locale,
    messages,
    t: createTranslator(messages),
  };
}
