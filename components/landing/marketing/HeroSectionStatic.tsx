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

function resolve(messages: MessageTree, key: string): unknown {
  const parts = key.split(".");
  let cur: unknown = messages;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function t(messages: MessageTree, key: string): string {
  const cur = resolve(messages, key);
  return typeof cur === "string" ? cur : key;
}

function tList(messages: MessageTree, key: string): string[] {
  const cur = resolve(messages, key);
  return Array.isArray(cur) ? cur.filter((v): v is string => typeof v === "string") : [];
}

/** תוכן Hero בשרת — LCP טקסטואלי + poster (לא מחכה ל-hydration של Omnibar). */
export default function HeroSectionStatic({ locale, messages }: Props) {
  const dir = isRtlLocale(locale) ? "rtl" : "ltr";
  const chips = tList(messages, "marketingHome.hero.heroChips");

  return (
    <section
      className="mkt-hero-section relative flex min-h-[100svh] flex-col px-4 pb-4 pt-[calc(var(--mkt-nav-height,4.25rem)+0.5rem)] sm:px-6 sm:pb-6 sm:pt-20 md:pb-8"
      id="hero"
      dir={dir}
    >
      <p className="mkt-hero-blessing mb-2 text-center sm:mb-3">
        {t(messages, "marketingHome.hero.titleBlessing")}
      </p>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center gap-5 pb-[8vh] sm:gap-8 sm:pb-[12vh]">
        <div className="flex w-full max-w-4xl flex-col items-center text-center">
          <p className="mkt-eyebrow mb-3 text-sm font-bold tracking-widest uppercase sm:mb-5">
            {t(messages, "marketingHome.hero.kicker")}
          </p>
          <h1 className="mkt-hero-title">
            <span className="mkt-hero-title-line1 block">{t(messages, "marketingHome.hero.titleLine1")}</span>
            <span className="mkt-hero-title-line2 block">{t(messages, "marketingHome.hero.titleLine2")}</span>
          </h1>
          <p className="mkt-body-lead mt-3 max-w-2xl text-base leading-relaxed sm:mt-6 sm:text-lg md:text-xl">
            {t(messages, "marketingHome.hero.subtitle")}
          </p>
          <p className="mkt-hero-motto mt-3 sm:mt-4">{t(messages, "marketingHome.hero.motto")}</p>
          {chips.length > 0 ? (
            <ul className="mt-5 flex flex-wrap items-center justify-center gap-2 sm:mt-6 sm:gap-2.5" role="list">
              {chips.map((chip) => (
                <li key={chip} className="mkt-hero-chip">
                  {chip}
                </li>
              ))}
            </ul>
          ) : null}
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
