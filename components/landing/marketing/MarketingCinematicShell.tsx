import "./marketing-cinematic.css";
import HeroSectionStatic from "@/components/landing/marketing/HeroSectionStatic";
import MarketingHeroPoster from "@/components/landing/marketing/MarketingHeroPoster";
import MarketingCinematicClient from "@/components/landing/marketing/MarketingCinematicClient";
import type { AppLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";

type Props = Readonly<{
  locale?: AppLocale;
}>;

/** Server shell — Hero HTML ב-RSC; אינטראקציה (וידאו, omnibar) ב-client island. */
export default function MarketingCinematicShell({ locale = "he" }: Props) {
  const messages = getMessages(locale);

  return (
    <>
      <MarketingHeroPoster />
      <MarketingCinematicClient
        locale={locale}
        hero={<HeroSectionStatic locale={locale} messages={messages} />}
      />
    </>
  );
}
