"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

const TIER_INDICES = [0, 1, 2, 3] as const;
const POINTS_PER_TIER = 4;

type Props = Readonly<{
  onRegister: () => void;
  embedded?: boolean;
  inPanel?: boolean;
}>;

export default function PricingSection({ onRegister, embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "pricing"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-7xl">
        {inPanel ? (
          <div className="mb-8 space-y-2 border-s-2 border-amber-400/50 ps-4 text-start">
            <p className="mkt-panel-lead">{t("marketingPricing.description")}</p>
            <p className="text-sm text-slate-400">{t("marketingHome.plans.body")}</p>
          </div>
        ) : (
          <ScrollReveal className="mkt-section-intro mb-12">
            <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
              {t("marketingPricing.eyebrow")}
            </p>
            <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">{t("marketingPricing.title")}</h2>
            <p className="mt-4 text-lg text-slate-300">{t("marketingPricing.description")}</p>
            <p className="mt-2 text-sm text-slate-400">{t("marketingHome.plans.body")}</p>
          </ScrollReveal>
        )}

        <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {TIER_INDICES.map((tierIndex, index) => {
            const featured = tierIndex === 1;
            return (
              <ScrollReveal key={tierIndex} delay={0.06 * index} className="h-full">
                <article
                  className={`mkt-glass flex h-full min-h-[420px] flex-col rounded-3xl p-6 ${
                    featured ? "border-amber-400/40 ring-1 ring-amber-400/30" : ""
                  }`}
                >
                  <div className="mb-3 min-h-6">
                    {featured ? (
                      <span className="inline-flex rounded-full bg-amber-500/20 px-3 py-1 text-xs font-bold text-amber-200">
                        {t("marketingHome.plans.featured")}
                      </span>
                    ) : null}
                  </div>
                  <h3 className="text-xl font-bold text-white">{t(`marketingPricing.tiers.${tierIndex}.name`)}</h3>
                  <p className="mt-1 text-sm font-semibold text-amber-200/90">
                    {t(`marketingPricing.tiers.${tierIndex}.price`)}
                  </p>
                  <p className="mt-3 text-sm text-slate-400">{t(`marketingPricing.tiers.${tierIndex}.body`)}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-300">
                    {Array.from({ length: POINTS_PER_TIER }, (_, pi) => (
                      <li key={pi} className="flex gap-2">
                        <span className="text-emerald-400">•</span>
                        {t(`marketingPricing.tiers.${tierIndex}.points.${pi}`)}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={onRegister}
                    className={`mt-6 w-full rounded-2xl py-3 text-sm font-bold ${
                      featured ? "mkt-btn-primary" : "mkt-btn-ghost"
                    }`}
                  >
                    {t("marketingHome.plans.joinPrefix")}
                    {t(`marketingPricing.tiers.${tierIndex}.name`)}
                  </button>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </Root>
  );
}
