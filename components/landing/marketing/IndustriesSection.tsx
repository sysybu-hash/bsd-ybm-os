"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

/** Must match `marketingHome.industries.tags` length in locale JSON files. */
const TAG_COUNT = 8;
const TAG_INDICES = Array.from({ length: TAG_COUNT }, (_, i) => i);

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function IndustriesSection({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "industries"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-7xl">
        {inPanel ? (
          <p className="mkt-panel-lead mb-6 border-s-2 border-amber-400/50 ps-4 text-start">
            {t("marketingHome.industries.body")}
          </p>
        ) : (
          <ScrollReveal className="mkt-section-intro mb-10">
            <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
              {t("marketingHome.industries.label")}
            </p>
            <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">{t("marketingHome.industries.title")}</h2>
            <p className="mt-4 text-lg text-slate-300">{t("marketingHome.industries.body")}</p>
          </ScrollReveal>
        )}

        <ScrollReveal delay={0.1}>
          <div className="mx-auto grid max-w-4xl grid-cols-2 gap-3 sm:grid-cols-4">
            {TAG_INDICES.map((i) => (
              <span
                key={i}
                className="mkt-glass flex items-center justify-center rounded-2xl border border-white/10 px-4 py-3 text-center text-sm font-semibold text-slate-200"
              >
                {t(`marketingHome.industries.tags.${i}`)}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </Root>
  );
}
