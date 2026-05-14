import { cookies } from "next/headers";
import type { MessageTree } from "@/lib/i18n/keys";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";

/** הודעות UI לפי עוגיית השפה — לשימוש ב־RSC וב־Server Actions */
export async function readRequestMessages(): Promise<MessageTree> {
  const jar = await cookies();
  return getMessages(normalizeLocale(jar.get(COOKIE_LOCALE)?.value));
}
