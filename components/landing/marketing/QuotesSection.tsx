"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

const QUOTE_INDICES = [0, 1, 2] as const;

export default function QuotesSection() {
  const { t } = useI18n();

  return (
    <section id="quotes" className="scroll-mt-24 px-4 py-16 sm:px-6 md:py-24">
      <div className="mx-auto max-w-7xl">
        <ScrollReveal className="mkt-section-intro mb-10">
          <h2 className="text-3xl font-black text-white md:text-4xl">
            {t("marketingHome.editorial.quotesSectionTitle")}
          </h2>
        </ScrollReveal>

        <div className="grid items-stretch gap-4 md:grid-cols-3">
          {QUOTE_INDICES.map((i, index) => (
            <ScrollReveal key={i} delay={0.08 * index} className="h-full">
              <blockquote className="mkt-glass flex h-full min-h-[200px] flex-col justify-between rounded-3xl p-6">
                <p className="text-base leading-relaxed text-slate-200">
                  &ldquo;{t(`marketingHome.editorial.quotes.${i}.body`)}&rdquo;
                </p>
                <footer className="mt-4 text-sm font-semibold text-amber-200/80">
                  {t(`marketingHome.editorial.quotes.${i}.role`)}
                </footer>
              </blockquote>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
