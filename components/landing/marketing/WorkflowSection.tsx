"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

const STEP_INDICES = [0, 1, 2, 3] as const;

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function WorkflowSection({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "workflow"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-7xl">
        {inPanel ? (
          <p className="mkt-panel-lead mb-8 border-s-2 border-amber-400/50 ps-4 text-start">
            {t("marketingHome.workflow.lead")}
          </p>
        ) : (
          <ScrollReveal className="mkt-section-intro mb-12">
            <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">
              {t("marketingHome.workflow.label")}
            </p>
            <h2 className="mt-3 text-3xl font-black text-white md:text-4xl">{t("marketingHome.workflow.title")}</h2>
            <p className="mt-4 text-lg text-slate-300">{t("marketingHome.workflow.lead")}</p>
          </ScrollReveal>
        )}

        <ol className="grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEP_INDICES.map((i, index) => (
            <ScrollReveal key={i} delay={0.08 * index} className="h-full">
              <li className="mkt-glass relative flex h-full min-h-[160px] list-none flex-col rounded-3xl p-6">
                <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/20 text-lg font-black text-amber-200">
                  {i + 1}
                </span>
                <p className="text-base font-semibold leading-relaxed text-white">
                  {t(`marketingHome.workflow.steps.${i}`)}
                </p>
              </li>
            </ScrollReveal>
          ))}
        </ol>

        <ScrollReveal delay={0.2} className="mt-8">
          <p className="mkt-glass rounded-2xl border border-emerald-500/20 px-6 py-4 text-center text-sm text-slate-300">
            {t("marketingHome.workflow.stepSub")}
          </p>
        </ScrollReveal>
      </div>
    </Root>
  );
}
