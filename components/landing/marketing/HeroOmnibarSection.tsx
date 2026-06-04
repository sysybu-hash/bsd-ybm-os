"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import HeroOmnibar from "@/components/landing/marketing/HeroOmnibar";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { MarketingHeroOmnibarState } from "@/hooks/useMarketingHeroOmnibar";

type Props = Readonly<{
  omnibar: MarketingHeroOmnibarState;
}>;

/** Omnibar בלבד — העתק ה-Hero כבר ב-HeroSectionStatic (שרת). */
export default function HeroOmnibarSection({ omnibar }: Props) {
  const { t } = useI18n();
  return (
    <section
      className="relative -mt-2 px-4 pb-6 sm:px-6 sm:pb-10 md:pb-12"
      aria-label={t("marketingHome.hero.omnibarLabel")}
    >
      <ScrollReveal eager delay={0.05} className="mx-auto flex max-w-7xl justify-center px-2">
        <HeroOmnibar omnibar={omnibar} />
      </ScrollReveal>
    </section>
  );
}
