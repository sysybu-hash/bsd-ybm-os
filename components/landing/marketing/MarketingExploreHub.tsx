"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useMarketingPanel } from "@/components/landing/marketing/MarketingPanelContext";
import { MARKETING_EXPLORE_PANELS } from "@/lib/marketing/marketing-panels";
import { useI18n } from "@/components/os/system/I18nProvider";

export default function MarketingExploreHub() {
  const { t } = useI18n();
  const { openPanel } = useMarketingPanel();

  return (
    <section id="explore" className="scroll-mt-24 px-4 py-10 sm:px-6 md:py-14" aria-labelledby="mkt-explore-heading">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal className="mkt-section-intro mb-8 text-center">
          <h2 id="mkt-explore-heading" className="text-2xl font-black text-white sm:text-3xl">
            {t("marketingHome.panels.hubTitle")}
          </h2>
          <p className="mt-3 text-base text-slate-300 sm:text-lg">{t("marketingHome.panels.hubLead")}</p>
        </ScrollReveal>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MARKETING_EXPLORE_PANELS.map((item, index) => {
            const Icon = item.icon;
            return (
              <ScrollReveal key={item.id} delay={0.04 * index} className="h-full">
                <li className="h-full list-none">
                  <button
                    type="button"
                    onClick={() => openPanel(item.id)}
                    className="mkt-explore-card group flex h-full min-h-[108px] w-full flex-col items-start gap-3 rounded-2xl border p-4 text-start transition active:scale-[0.99] sm:min-h-[120px] sm:p-5"
                  >
                    <span className="mkt-explore-card-icon flex h-11 w-11 items-center justify-center rounded-xl">
                      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
                    </span>
                    <span className="block text-base font-bold text-white">{t(item.titleKey)}</span>
                    <span className="block text-sm leading-snug text-slate-400 group-hover:text-slate-300">
                      {t(item.descriptionKey)}
                    </span>
                  </button>
                </li>
              </ScrollReveal>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
