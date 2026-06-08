import HeroSectionStatic from "@/components/landing/marketing/HeroSectionStatic";
import MarketingHeroPoster from "@/components/landing/marketing/MarketingHeroPoster";
import MarketingDeferredStyles from "@/components/landing/marketing/MarketingDeferredStyles";
import MarketingCinematicClient from "@/components/landing/marketing/MarketingCinematicClient";
import type { AppLocale } from "@/lib/i18n/config";
import { getMarketingMessages } from "@/lib/i18n/load-messages";

type Props = Readonly<{
  locale?: AppLocale;
}>;

/** Server shell — Hero HTML ב-RSC; אינטראקציה (וידאו, omnibar) ב-client island. */
export default function MarketingCinematicShell({ locale = "he" }: Props) {
  const messages = getMarketingMessages(locale);

  return (
    <>
      <MarketingDeferredStyles />
      <MarketingHeroPoster />
      <MarketingCinematicClient
        locale={locale}
        hero={<HeroSectionStatic locale={locale} messages={messages} />}
      />
    </>
  );
}
