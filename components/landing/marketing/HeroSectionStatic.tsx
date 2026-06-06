import Link from "next/link";
import type { AppLocale } from "@/lib/i18n/config";
import { isRtlLocale } from "@/lib/i18n/config";
import type { MessageTree } from "@/lib/i18n/keys";

function HeroCtaChevron({ rtl }: { rtl: boolean }) {
  return (
    <svg
      className={`h-5 w-5 transition-transform group-hover:-translate-x-0.5 ${rtl ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M7.21 14.77a.75.75 0 01.02-1.06L10.94 10 7.23 6.29a.75.75 0 111.06-1.06l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.08-.02z"
        clipRule="evenodd"
      />
    </svg>
  );
}

type Props = Readonly<{
  locale: AppLocale;
  messages: MessageTree;
}>;

function t(messages: MessageTree, key: string): string {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return key;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" ? cur : key;
}

/** תוכן Hero בשרת — LCP טקסטואלי + poster (לא מחכה ל-hydration של Omnibar). */
export default function HeroSectionStatic({ locale, messages }: Props) {
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";

  return (
    <section
      className="mkt-hero-section relative px-4 pb-4 pt-[calc(var(--mkt-nav-height,4.25rem)+0.25rem)] sm:px-6 sm:pb-6 sm:pt-32 md:pb-8"
      id="hero"
      dir={dir}
    >
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-5 sm:gap-8">
        <div className="flex w-full max-w-4xl flex-col items-center text-center">
          <p className="mkt-hero-blessing mb-1.5 sm:mb-4">{t(messages, "marketingHome.hero.titleBlessing")}</p>
          <p className="mkt-eyebrow mb-1.5 text-sm font-bold tracking-widest uppercase sm:mb-3">
            {t(messages, "marketingHome.hero.kicker")}
          </p>
          <p className="mkt-hero-motto mb-3 sm:mb-5">{t(messages, "marketingHome.hero.motto")}</p>
          <h1 className="mkt-hero-title">
            <span className="mkt-hero-title-line1 block">{t(messages, "marketingHome.hero.titleLine1")}</span>
            <span className="mkt-hero-title-line2 block">{t(messages, "marketingHome.hero.titleLine2")}</span>
          </h1>
          <p className="mkt-body-lead mt-3 max-w-2xl text-base leading-relaxed sm:mt-6 sm:text-lg md:text-xl">
            {t(messages, "marketingHome.hero.subtitle")}
          </p>
        </div>
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/login?mode=register"
            className="group inline-flex items-center justify-center gap-2 rounded-2xl mkt-btn-primary px-8 py-4 text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t(messages, "marketingHome.hero.ctaRegister")}
            <HeroCtaChevron rtl={dir === "rtl"} />
          </Link>
          <Link
            href="/login"
            className="rounded-2xl mkt-btn-ghost px-8 py-4 text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            {t(messages, "marketingHome.osLanding.signIn")}
          </Link>
        </div>
      </div>
    </section>
  );
}
