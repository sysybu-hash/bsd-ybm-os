import type { ReactNode } from "react";
import type { AppLocale } from "@/lib/i18n/config";
import { isRtlLocale } from "@/lib/i18n/config";
import { getMessages } from "@/lib/i18n/load-messages";
import { skipToMainLabel } from "@/lib/skip-to-main-label";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/os/system/I18nProvider";
import MarketingHeroPreload from "@/components/layout/MarketingHeroPreload";
import StructuredDataScript from "@/components/seo/StructuredDataScript";
import CookieConsentBanner from "@/components/legal/CookieConsentBanner";
import AppToaster from "@/components/os/system/AppToaster";
import { MarketingAnalyticsClient } from "@/components/layout/MarketingAnalyticsClient";

type Props = Readonly<{
  locale: AppLocale;
  children: ReactNode;
}>;

/** עטיפה רזה לדף נחיתה סטטי — ללא Session/Prisma בשרת */
export default function MarketingSiteLayout({ locale, children }: Props) {
  const messages = getMessages(locale);
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const mainSkipLabel = skipToMainLabel(messages, locale);

  return (
    <div
      className="marketing-cinematic-root min-h-dvh font-sans antialiased"
      dir={dir}
      lang={locale}
    >
      <MarketingHeroPreload />
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <I18nProvider locale={locale} messages={messages}>
          <MarketingAnalyticsClient />
          <a
            href="#site-main"
            className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100000] focus:rounded-xl focus:bg-[#1f2937] focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-white focus:shadow-lg focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-white"
          >
            {mainSkipLabel}
          </a>
          <div id="site-main" tabIndex={-1} className="outline-none focus:outline-none">
            <StructuredDataScript />
            {children}
            <CookieConsentBanner />
            <AppToaster />
          </div>
        </I18nProvider>
      </ThemeProvider>
    </div>
  );
}
