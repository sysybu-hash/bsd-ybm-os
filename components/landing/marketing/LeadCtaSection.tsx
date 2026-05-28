"use client";

import ScrollReveal from "@/components/landing/marketing/ScrollReveal";
import { useI18n } from "@/components/os/system/I18nProvider";

type Props = Readonly<{
  onRegister: () => void;
  onLogin: () => void;
  embedded?: boolean;
  inPanel?: boolean;
}>;

export default function LeadCtaSection({ onRegister, onLogin, embedded = false, inPanel = false }: Props) {
  const { t } = useI18n();
  const Root = embedded ? "div" : "section";

  return (
    <Root id={embedded ? undefined : "cta"} className={embedded ? "" : "scroll-mt-24 px-4 py-16 sm:px-6 md:py-24"}>
      <div className="mx-auto max-w-4xl">
        <ScrollReveal>
          <div className="mkt-glass-strong relative overflow-hidden rounded-3xl border border-amber-500/20 p-8 text-center md:p-12">
            <div
              className="pointer-events-none absolute inset-0 opacity-30"
              aria-hidden
              style={{
                background:
                  "radial-gradient(circle at 50% 0%, rgba(212,168,83,0.25), transparent 55%)",
              }}
            />
            {!inPanel ? (
              <p className="mkt-eyebrow relative text-sm font-bold tracking-widest uppercase">
                {t("marketingHome.cta.label")}
              </p>
            ) : null}
            <h2
              className={`relative font-black text-white ${inPanel ? "text-2xl md:text-3xl" : "mt-4 text-3xl md:text-4xl"}`}
            >
              {t("marketingHome.cta.title")}
            </h2>
            <p className="relative mx-auto mt-4 max-w-2xl text-lg text-slate-300">{t("marketingHome.cta.body")}</p>
            <p className="relative mt-2 text-sm text-slate-400">{t("marketingHome.editorial.footerContactBlurb")}</p>
            <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button type="button" onClick={onRegister} className="rounded-2xl mkt-btn-primary px-8 py-4 font-bold">
                {t("marketingHome.cta.primary")}
              </button>
              <button type="button" onClick={onLogin} className="rounded-2xl mkt-btn-ghost px-8 py-4 font-bold">
                {t("marketingHome.cta.secondary")}
              </button>
            </div>
          </div>
        </ScrollReveal>
      </div>
    </Root>
  );
}
