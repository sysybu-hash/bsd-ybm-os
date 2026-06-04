import { cookies } from "next/headers";
import "./marketing-cinematic.css";
import HeroSectionStatic from "@/components/landing/marketing/HeroSectionStatic";
import MarketingCinematicClient from "@/components/landing/marketing/MarketingCinematicClient";
import { COOKIE_LOCALE, normalizeLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";

/** Server shell — Hero HTML ב-RSC; אינטראקציה (וידאו, omnibar) ב-client island. */
export default async function MarketingCinematicShell() {
  const jar = await cookies();
  const locale = normalizeLocale(jar.get(COOKIE_LOCALE)?.value);
  const messages = getMessages(locale);

  return (
    <MarketingCinematicClient
      hero={<HeroSectionStatic locale={locale} messages={messages} />}
    />
  );
}
