"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { BrainCircuit, BarChart3, Fingerprint, ChevronLeft, ChevronRight, Mic } from "lucide-react";
import BrandHomeLink from "@/components/brand/BrandHomeLink";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useI18n } from "@/components/os/system/I18nProvider";

const featureIcons = [BrainCircuit, Mic, BarChart3, Fingerprint] as const;

const revealStyle = (delaySec: number): React.CSSProperties => ({
  animationDelay: `${delaySec}s`,
});

export default function LandingPage({
  onLogin,
  onRegister,
}: {
  onLogin: () => void;
  onRegister?: () => void;
}) {
  const router = useRouter();
  const { t, dir } = useI18n();
  const CtaIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const features = [0, 1, 2, 3].map((i) => ({
    title: t(`marketingHome.osLanding.features.${i}.title`),
    body: t(`marketingHome.osLanding.features.${i}.body`),
    icon: featureIcons[i]!,
  }));

  return (
    <div
      className="relative min-h-dvh overflow-x-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
      dir={dir}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 start-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-blue-500/10 blur-[120px]" />
        <div className="absolute bottom-0 end-0 h-[400px] w-[400px] rounded-full bg-emerald-500/10 blur-[100px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-4 py-6 sm:px-8">
        <BrandHomeLink size="sm" variant="image" tone="auto" priority />
        <div className="flex items-center gap-3">
          <LocaleSwitcher />
          <ThemeToggle />
          <button
            type="button"
            onClick={onLogin}
            className="rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-6 py-2.5 text-sm font-medium text-[color:var(--foreground-main)] shadow-sm backdrop-blur-md transition-all hover:bg-[color:var(--surface-soft)]"
          >
            {t("marketingHome.osLanding.signIn")}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl min-w-0 px-4 pb-24 pt-12 sm:px-6 sm:pb-28 sm:pt-16 md:px-8 md:pb-32 md:pt-20">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center">
          <div className="landing-reveal mb-6" style={revealStyle(0.1)}>
            <BrandHomeLink
              size="hero"
              variant="image"
              tone="auto"
              className="mx-auto pointer-events-none"
              priority
            />
          </div>

          <div
            className="landing-reveal mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400"
            style={revealStyle(0.2)}
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            {t("marketingHome.osLanding.badge")}
          </div>

          <h1
            className="landing-reveal mb-8 text-4xl font-black leading-tight tracking-tighter sm:text-5xl md:text-6xl lg:text-8xl"
            style={revealStyle(0.3)}
          >
            {t("marketingHome.osLanding.heroTitleLine1")} <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              {t("marketingHome.osLanding.heroTitleLine2")}
            </span>
          </h1>

          <p
            className="landing-reveal mb-12 max-w-2xl text-xl leading-relaxed text-[color:var(--foreground-muted)] md:text-2xl"
            style={revealStyle(0.4)}
          >
            {t("marketingHome.osLanding.heroSubtitle")}
          </p>

          <div className="landing-reveal flex flex-col gap-4 sm:flex-row" style={revealStyle(0.5)}>
            <button
              type="button"
              onClick={onLogin}
              className="group flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-4 text-lg font-bold text-white transition-all hover:shadow-lg hover:shadow-blue-500/25"
            >
              {t("marketingHome.osLanding.ctaStart")}
              <CtaIcon className="h-5 w-5 transition-transform group-hover:translate-x-[-4px]" />
            </button>
            <button
              type="button"
              onClick={onRegister ?? (() => router.push("/register"))}
              className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-8 py-4 text-lg font-bold text-[color:var(--foreground-main)] shadow-sm backdrop-blur-sm transition-all hover:bg-[color:var(--surface-soft)]"
            >
              {t("nav.register")}
            </button>
          </div>
        </div>

        <div className="mt-32 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={<feature.icon className="h-6 w-6 text-emerald-400" />}
              title={feature.title}
              description={feature.body}
              delay={0.6 + 0.1 * (index + 1)}
            />
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[color:var(--border-main)] px-8 py-8 text-center text-xs text-[color:var(--foreground-muted)]">
        <nav className="mb-4 flex flex-wrap items-center justify-center gap-4 font-bold">
          <a href="/about" className="transition-colors hover:text-[color:var(--foreground-main)]">
            {t("marketingHome.osLanding.footerAbout")}
          </a>
          <a href="/privacy" className="transition-colors hover:text-[color:var(--foreground-main)]">
            {t("marketingHome.osLanding.footerPrivacy")}
          </a>
          <a href="/terms" className="transition-colors hover:text-[color:var(--foreground-main)]">
            {t("marketingHome.osLanding.footerTerms")}
          </a>
          <a href="/legal" className="transition-colors hover:text-[color:var(--foreground-main)]">
            {t("marketingHome.osLanding.footerCookies")}
          </a>
        </nav>
        <p>{t("marketingHome.osLanding.footerCopyright", { year: String(new Date().getFullYear()) })}</p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  delay,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <div
      className="landing-reveal rounded-3xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 p-6 backdrop-blur-md transition-colors hover:bg-[color:var(--surface-soft)]"
      style={revealStyle(delay)}
    >
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--surface-soft)]">{icon}</div>
      <h3 className="mb-3 text-xl font-bold text-[color:var(--foreground-main)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[color:var(--foreground-muted)]">{description}</p>
    </div>
  );
}
