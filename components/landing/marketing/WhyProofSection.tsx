"use client";

import { CheckCircle2 } from "lucide-react";
import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

const WHY_ROWS = [0, 1, 2] as const;
const PROOF_POINTS = [0, 1, 2, 3] as const;

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function WhyProofSection({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "why"} className={embedded ? "" : "px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2 lg:items-stretch lg:gap-10">
        <div className="flex flex-col">
          {inPanel ? (
            <p className="mkt-panel-lead mb-6 border-s-2 border-amber-400/50 ps-4 text-start lg:mx-0">
              {t("marketingHome.why.title")}
            </p>
          ) : (
            <ScrollReveal className="mkt-section-intro lg:mx-0 lg:max-w-none lg:text-start">
              <p className="mkt-eyebrow text-sm font-bold tracking-widest uppercase">{t("marketingHome.why.label")}</p>
              <h2 className="mt-3 text-3xl font-black text-white">{t("marketingHome.why.title")}</h2>
            </ScrollReveal>
          )}
          <ul className="mt-8 flex flex-1 flex-col gap-4">
            {WHY_ROWS.map((i, index) => (
              <ScrollReveal key={i} delay={0.06 * index} className="flex-1">
                <li className="mkt-glass flex h-full flex-col justify-center rounded-2xl p-5">
                  <h3 className="font-bold text-white">{t(`marketingHome.why.rows.${i}.title`)}</h3>
                  <p className="mt-2 text-sm text-slate-400">{t(`marketingHome.why.rows.${i}.body`)}</p>
                </li>
              </ScrollReveal>
            ))}
          </ul>
        </div>

        <ScrollReveal delay={0.1} className="h-full min-h-0">
          <div className="mkt-glass flex h-full min-h-[280px] flex-col justify-center rounded-3xl p-8 lg:min-h-full">
            <ul className="space-y-5">
              {PROOF_POINTS.map((i) => (
                <li key={i} className="flex gap-3 text-base font-medium text-slate-200">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" aria-hidden />
                  <span>{t(`marketingHome.proofPoints.${i}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        </ScrollReveal>
      </div>
    </Root>
  );
}
