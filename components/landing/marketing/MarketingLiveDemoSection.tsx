"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import MarketingFieldScanDemo from "@/components/landing/marketing/MarketingFieldScanDemo";
import DesktopOsMockup from "@/components/landing/marketing/DesktopOsMockup";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function MarketingLiveDemoSection() {
  const { t } = useI18n();

  return (
    <section
      id="live-demo"
      className="scroll-mt-28 px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="mkt-live-demo-heading"
    >
      <div className="mx-auto max-w-7xl">
        <ScrollReveal className="mkt-section-intro mb-8 text-center md:mb-10">
          <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
            {t("marketingHome.hero.ctaDemo")}
          </p>
          <h2 id="mkt-live-demo-heading" className="mt-3 text-2xl font-black text-white sm:text-3xl md:text-4xl">
            {t("marketingHome.panels.demo.title")}
          </h2>
          <p className="mkt-body-lead mt-4 text-base font-semibold text-slate-300 sm:text-lg">
            {t("marketingHome.panels.demo.description")}
          </p>
          <p className="mt-3 text-sm font-medium text-slate-400">{t("marketingHome.panels.demo.intro")}</p>
        </ScrollReveal>

        <div className="mkt-hero-demo-pair grid gap-6 lg:grid-cols-2">
          <ScrollReveal delay={0.05} className="mkt-hero-demo-slot">
            <MarketingFieldScanDemo />
          </ScrollReveal>
          <ScrollReveal delay={0.1} className="mkt-hero-demo-slot hidden min-h-[min(52vh,420px)] lg:flex">
            <DesktopOsMockup className="h-full w-full" />
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
}
