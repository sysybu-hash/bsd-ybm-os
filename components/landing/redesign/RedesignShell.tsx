"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowLeft,
  Boxes,
  Camera,
  CheckCircle2,
  FileText,
  FolderKanban,
  HardHat,
  LayoutGrid,
  Mic,
  Shield,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { getRedesignCopy } from "@/components/landing/redesign/copy";

const FieldScanDemo = dynamic(
  () => import("@/components/landing/marketing/MarketingFieldScanDemo"),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded-2xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5" aria-hidden />
    ),
  },
);

const REGISTER_HREF = "/login?mode=register";
const SIGNIN_HREF = "/login";

const BTN_PRIMARY =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-amber-400 active:scale-[0.99]";
const BTN_GHOST =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 dark:border-white/15 dark:text-slate-200 dark:hover:bg-white/5";
const CARD =
  "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition dark:border-white/10 dark:bg-white/[0.04]";

const MODULE_ICONS = [Users, FolderKanban, FileText, Wallet, HardHat, Sparkles];
const VALUE_ICONS = [LayoutGrid, Camera, Sparkles];

export default function RedesignShell() {
  const { locale, dir } = useI18n();
  const c = getRedesignCopy(locale);

  return (
    <div
      className="min-h-dvh bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100"
      dir={dir}
    >
      {/* ── Nav ── */}
      <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-slate-50/85 backdrop-blur-md dark:border-white/10 dark:bg-slate-950/80">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <BrandHomeLink size="xs" variant="image" tone="auto" priority />
          <div className="hidden items-center gap-7 text-sm font-bold text-slate-600 dark:text-slate-300 md:flex">
            <a href="#how" className="transition hover:text-amber-600 dark:hover:text-amber-400">{c.nav.howItWorks}</a>
            <a href="#modules" className="transition hover:text-amber-600 dark:hover:text-amber-400">{c.nav.modules}</a>
            <a href="#pricing" className="transition hover:text-amber-600 dark:hover:text-amber-400">{c.nav.pricing}</a>
            <a href="#contact" className="transition hover:text-amber-600 dark:hover:text-amber-400">{c.nav.contact}</a>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="hidden sm:block"><LocaleSwitcher compact /></div>
            <ThemeToggle variant="toolbar" />
            <Link href={SIGNIN_HREF} className="hidden rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition hover:text-slate-900 dark:text-slate-300 dark:hover:text-white sm:inline-flex">
              {c.nav.signIn}
            </Link>
            <Link href={REGISTER_HREF} className="inline-flex items-center rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-bold text-slate-950 transition hover:bg-amber-400">
              {c.nav.register}
            </Link>
          </div>
        </nav>
      </header>

      <main id="site-main-content">
        {/* ── Hero ── */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute -top-40 start-1/2 h-[460px] w-[760px] -translate-x-1/2 rounded-full bg-amber-500/15 blur-[130px]" />
          </div>
          <div className="relative mx-auto max-w-4xl px-4 pb-16 pt-16 text-center sm:px-6 sm:pt-24 md:pb-24">
            <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-700 dark:text-amber-300">
              <Sparkles size={13} aria-hidden /> {c.hero.blessing}
            </span>
            <h1 className="mt-6 text-balance text-4xl font-black leading-[1.1] tracking-tight text-slate-900 dark:text-white sm:text-5xl md:text-6xl">
              {c.hero.title}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-slate-600 dark:text-slate-300 sm:text-lg sm:leading-8">
              {c.hero.subtitle}
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={REGISTER_HREF} className={`${BTN_PRIMARY} w-full sm:w-auto`}>
                {c.hero.ctaPrimary}
                <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
              </Link>
              <a href="#demo" className={`${BTN_GHOST} w-full sm:w-auto`}>
                <Mic size={18} aria-hidden /> {c.hero.ctaSecondary}
              </a>
            </div>
            <p className="mt-6 text-sm font-medium text-slate-500 dark:text-slate-400">{c.hero.trust}</p>
          </div>
        </section>

        {/* ── Proof strip ── */}
        <section className="border-y border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 py-10 sm:grid-cols-3 sm:px-6">
            {c.proof.items.map((it) => (
              <div key={it.label} className="text-center">
                <div className="text-3xl font-black text-amber-600 dark:text-amber-400 sm:text-4xl">{it.value}</div>
                <div className="mt-1 text-sm font-semibold text-slate-600 dark:text-slate-400">{it.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Value ── */}
        <Section>
          <SectionIntro title={c.value.title} subtitle={c.value.subtitle} />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {c.value.cards.map((card, i) => {
              const Icon = VALUE_ICONS[i % VALUE_ICONS.length]!;
              return (
                <div key={card.title} className={CARD}>
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
                    <Icon size={22} aria-hidden />
                  </div>
                  <h3 className="mt-4 text-lg font-black">{card.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{card.body}</p>
                </div>
              );
            })}
          </div>
        </Section>

        {/* ── Live demo ── */}
        <section id="demo" className="scroll-mt-20 border-y border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 md:py-20">
            <div className="text-center">
              <span className="text-sm font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">{c.demo.label}</span>
              <h2 className="mt-3 text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">{c.demo.title}</h2>
              <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{c.demo.subtitle}</p>
            </div>
            <div className="mt-8">
              <FieldScanDemo />
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <Section id="how">
          <SectionIntro title={c.how.title} subtitle={c.how.subtitle} />
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {c.how.steps.map((step) => (
              <div key={step.title} className={CARD}>
                <h3 className="text-lg font-black text-amber-600 dark:text-amber-400">{step.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.body}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Modules ── */}
        <section id="modules" className="scroll-mt-20 border-y border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
            <SectionIntro title={c.modules.title} subtitle={c.modules.subtitle} />
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {c.modules.items.map((m, i) => {
                const Icon = MODULE_ICONS[i % MODULE_ICONS.length]!;
                return (
                  <div key={m.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400">
                      <Icon size={20} aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-black">{m.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">{m.body}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Industries ── */}
        <Section>
          <SectionIntro title={c.industries.title} subtitle={c.industries.subtitle} />
          <div className="mt-8 flex flex-wrap justify-center gap-2.5">
            {c.industries.tags.map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
                <HardHat size={14} className="text-amber-500" aria-hidden /> {tag}
              </span>
            ))}
          </div>
        </Section>

        {/* ── Pricing ── */}
        <section id="pricing" className="scroll-mt-20 border-y border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 md:py-20">
            <SectionIntro title={c.pricing.title} subtitle={c.pricing.subtitle} />
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {c.pricing.plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-2xl border p-6 ${
                    plan.featured
                      ? "border-amber-500 bg-amber-500/[0.06] shadow-md ring-1 ring-amber-500/30"
                      : "border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.04]"
                  }`}
                >
                  {plan.featured ? (
                    <span className="absolute -top-3 start-6 rounded-full bg-amber-500 px-3 py-0.5 text-xs font-black text-slate-950">
                      הכי פופולרי
                    </span>
                  ) : null}
                  <h3 className="text-lg font-black">{plan.name}</h3>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-3xl font-black">{plan.price}</span>
                    <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{plan.period}</span>
                  </div>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-amber-500" aria-hidden /> {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={REGISTER_HREF}
                    className={`mt-6 ${plan.featured ? BTN_PRIMARY : BTN_GHOST} w-full`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
            <p className="mt-6 flex items-center justify-center gap-2 text-center text-sm text-slate-500 dark:text-slate-400">
              <Shield size={15} className="text-amber-500" aria-hidden /> {c.pricing.note}
            </p>
          </div>
        </section>

        {/* ── FAQ ── */}
        <Section>
          <SectionIntro title={c.faq.title} />
          <div className="mx-auto mt-8 max-w-2xl divide-y divide-slate-200 dark:divide-white/10">
            {c.faq.items.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-start font-bold">
                  {item.q}
                  <span className="text-amber-500 transition group-open:rotate-45" aria-hidden>+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{item.a}</p>
              </details>
            ))}
          </div>
        </Section>

        {/* ── Final CTA ── */}
        <section id="contact" className="scroll-mt-20 bg-gradient-to-br from-slate-900 to-slate-950 text-white">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 md:py-20">
            <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl">{c.finalCta.title}</h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-slate-300">{c.finalCta.subtitle}</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href={REGISTER_HREF} className={`${BTN_PRIMARY} w-full sm:w-auto`}>
                {c.finalCta.primary}
                <ArrowLeft size={18} className="rtl:rotate-180" aria-hidden />
              </Link>
              <Link href={SIGNIN_HREF} className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-6 py-3.5 text-sm font-bold text-white transition hover:bg-white/10 sm:w-auto">
                {c.finalCta.secondary}
              </Link>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="bg-slate-950 text-slate-400">
          <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-10 text-center sm:px-6">
            <div className="flex items-center gap-2 text-base font-black text-white">
              <Boxes size={18} className="text-amber-500" aria-hidden /> BSD-YBM OS
            </div>
            <p className="max-w-md text-sm">{c.footer.tagline}</p>
            <p className="mt-2 text-xs text-slate-500">© {new Date().getFullYear()} {c.footer.rights}</p>
          </div>
        </footer>
      </main>
    </div>
  );
}

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className={id ? "scroll-mt-20" : undefined}>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">{children}</div>
    </section>
  );
}

function SectionIntro({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h2 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white sm:text-4xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-base text-slate-600 dark:text-slate-300">{subtitle}</p> : null}
    </div>
  );
}
