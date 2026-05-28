"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import SiteFeedbackForm from "@/components/feedback/SiteFeedbackForm";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{ embedded?: boolean; inPanel?: boolean }>;

export default function MarketingFeedbackSection({ embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "feedback"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-2xl">
        {inPanel ? (
          <p className="mkt-panel-lead mb-6 text-center">{t("siteFeedback.marketingSectionLead")}</p>
        ) : (
          <ScrollReveal className="mkt-section-intro mb-8 text-center">
            <h2 className="text-3xl font-black text-white md:text-4xl">{t("siteFeedback.marketingSectionTitle")}</h2>
            <p className="mt-4 text-lg text-slate-300">{t("siteFeedback.marketingSectionLead")}</p>
          </ScrollReveal>
        )}
        <ScrollReveal delay={0.08}>
          <div className="mkt-glass rounded-3xl p-6 md:p-8">
            <SiteFeedbackForm context="marketing" />
          </div>
        </ScrollReveal>
      </div>
    </Root>
  );
}
