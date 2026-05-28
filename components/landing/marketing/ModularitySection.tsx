"use client";

import { Blocks } from "lucide-react";
import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

const ITEM_INDICES = [0, 1, 2] as const;

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function ModularitySection({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "modularity"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-7xl">
        {inPanel ? (
          <p className="mkt-panel-lead mb-6 flex items-start gap-3 border-s-2 border-emerald-400/50 ps-4 text-start">
            <Blocks className="mt-0.5 h-6 w-6 shrink-0 text-emerald-400/90" aria-hidden />
            <span>{t("marketingHome.modularity.lead")}</span>
          </p>
        ) : (
          <ScrollReveal className="mkt-section-intro mb-10 flex items-start gap-3">
            <Blocks className="mt-1 h-8 w-8 shrink-0 text-emerald-400/90" aria-hidden />
            <div>
              <h2 className="text-3xl font-black text-white md:text-4xl">
                {t("marketingHome.modularity.sectionTitle")}
              </h2>
              <p className="mt-3 max-w-2xl text-lg text-slate-300">{t("marketingHome.modularity.lead")}</p>
            </div>
          </ScrollReveal>
        )}

        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {ITEM_INDICES.map((i, index) => (
            <ScrollReveal key={i} delay={0.08 * index} className="h-full">
              <article className="mkt-glass flex h-full min-h-[200px] flex-col rounded-3xl p-6">
                <h3 className="text-lg font-bold text-emerald-100/95">
                  {t(`marketingHome.modularity.items.${i}.title`)}
                </h3>
                <p className="mt-3 text-base leading-relaxed text-slate-200">
                  {t(`marketingHome.modularity.items.${i}.body`)}
                </p>
              </article>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </Root>
  );
}
