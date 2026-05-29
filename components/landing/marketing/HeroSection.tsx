"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import HeroOmnibar from "@/components/landing/marketing/HeroOmnibar";
import type { MarketingHeroOmnibarState } from "@/hooks/useMarketingHeroOmnibar";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  onRegister: () => void;
  onLogin: () => void;
  omnibar: MarketingHeroOmnibarState;
}>;

export default function HeroSection({ onRegister, onLogin, omnibar }: Props) {
  const { t, dir } = useI18n();
  const CtaIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <section
      className="mkt-hero-section relative px-4 pb-10 pt-[calc(var(--mkt-nav-height,4.25rem)+0.25rem)] sm:px-6 sm:pb-12 sm:pt-32 md:pb-16"
      id="hero"
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 sm:gap-10">
        <ScrollReveal eager className="flex w-full max-w-4xl flex-col items-center text-center">
          <p className="mkt-hero-blessing mb-1.5 sm:mb-4">
            {t("marketingHome.hero.titleBlessing")}
          </p>
          <p className="mkt-eyebrow mb-1.5 text-sm font-bold tracking-widest uppercase sm:mb-3">
            {t("marketingHome.hero.kicker")}
          </p>
          <p className="mkt-hero-motto mb-2 text-lg font-bold text-amber-200/95 sm:mb-4 sm:text-2xl md:text-3xl">
            {t("marketingHome.hero.motto")}
          </p>
          <h1 className="mkt-hero-title">
            <span className="mkt-hero-title-line1 block">{t("marketingHome.hero.titleLine1")}</span>
            <span className="mkt-hero-title-line2 block">{t("marketingHome.hero.titleLine2")}</span>
          </h1>
          <p className="mkt-body-lead mt-3 max-w-2xl text-base leading-relaxed sm:mt-6 sm:text-lg md:text-xl">
            {t("marketingHome.hero.subtitle")}
          </p>
        </ScrollReveal>

        <ScrollReveal eager delay={0.1} className="flex w-full justify-center px-2">
          <HeroOmnibar omnibar={omnibar} />
        </ScrollReveal>

        <ScrollReveal eager delay={0.15} className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onRegister}
            className="group inline-flex items-center justify-center gap-2 rounded-2xl mkt-btn-primary px-8 py-4 text-lg font-bold"
          >
            {t("marketingHome.hero.ctaRegister")}
            <CtaIcon className="h-5 w-5 transition-transform group-hover:-translate-x-0.5 rtl:rotate-180" />
          </button>
          <button
            type="button"
            onClick={onLogin}
            className="rounded-2xl mkt-btn-ghost px-8 py-4 text-lg font-bold"
          >
            {t("marketingHome.osLanding.signIn")}
          </button>
        </ScrollReveal>

      </div>
    </section>
  );
}
