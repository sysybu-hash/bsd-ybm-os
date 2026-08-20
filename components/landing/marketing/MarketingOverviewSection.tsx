"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

/** סקירה כללית על המערכת — פסקת הסבר מקצועית לפני אזור ההדגמה החיה. */
export default function MarketingOverviewSection() {
  const { t } = useI18n();

  return (
    <section
      id="overview"
      className="scroll-mt-28 px-4 py-12 sm:px-6 md:py-16"
      aria-labelledby="mkt-overview-heading"
    >
      <ScrollReveal className="mkt-section-intro mb-6 text-center md:mb-8">
        <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
          {t("marketingHome.overview.eyebrow")}
        </p>
        <h2
          id="mkt-overview-heading"
          className="mt-3 text-2xl font-black text-white sm:text-3xl md:text-4xl"
        >
          {t("marketingHome.overview.title")}
        </h2>
      </ScrollReveal>

      <ScrollReveal delay={0.05} className="mx-auto max-w-3xl">
        <div className="mkt-glass rounded-2xl p-6 text-start sm:p-8">
          <p className="mkt-body-lead text-base leading-relaxed sm:text-lg">
            {t("marketingHome.overview.p1")}
          </p>
          <p className="mkt-body-lead mt-4 text-base leading-relaxed sm:text-lg">
            {t("marketingHome.overview.p2")}
          </p>
          <p className="mkt-body-lead mt-4 text-base leading-relaxed sm:text-lg">
            {t("marketingHome.overview.p3")}
          </p>
        </div>
      </ScrollReveal>
    </section>
  );
}
