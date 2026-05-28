"use client";

import { BENTO_MODULES } from "@/lib/landing/bento-modules";
import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function BentoModulesGrid({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "modules"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-7xl">
        {inPanel ? (
          <p className="mkt-panel-lead mb-8 border-s-2 border-amber-400/50 ps-4 text-start">
            {t("marketingHome.modulesSection.body")}
          </p>
        ) : (
          <ScrollReveal eager className="mkt-section-intro mb-12">
            <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
              {t("marketingHome.modulesSection.label")}
            </p>
            <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">
              {t("marketingHome.modulesSection.title")}
            </h2>
            <p className="mt-4 text-lg text-slate-300">{t("marketingHome.modulesSection.body")}</p>
          </ScrollReveal>
        )}

        <div
          className={
            inPanel
              ? "mkt-panel-bento-grid grid gap-4"
              : "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
          }
        >
          {BENTO_MODULES.map((mod, index) => {
            const Icon = mod.icon;
            return (
              <ScrollReveal key={mod.titleKey} delay={0.04 * (index % 5)} className="h-full">
                <article className="mkt-glass group flex h-full min-h-[168px] flex-col rounded-3xl p-6 transition-colors hover:border-emerald-400/25">
                  <div className="mb-4 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-slate-900/60 text-emerald-400 transition-colors group-hover:border-emerald-400/30 group-hover:text-emerald-300">
                    <Icon className="h-6 w-6" aria-hidden />
                  </div>
                  <h3 className="text-lg font-bold text-white sm:text-xl">{t(mod.titleKey)}</h3>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{t(mod.bodyKey)}</p>
                </article>
              </ScrollReveal>
            );
          })}
        </div>
      </div>
    </Root>
  );
}
