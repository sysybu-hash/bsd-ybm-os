"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { motion, type Variants } from "framer-motion";
import { BrainCircuit, BarChart3, Fingerprint, Layers, ChevronLeft, ChevronRight, Mic } from "lucide-react";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useI18n } from "@/components/os/system/I18nProvider";

const featureIcons = [BrainCircuit, Mic, BarChart3, Fingerprint] as const;

export default function LandingPage({ onLogin }: { onLogin: () => void }) {
  const router = useRouter();
  const { t, dir } = useI18n();
  const CtaIcon = dir === "rtl" ? ChevronLeft : ChevronRight;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2, delayChildren: 0.1 },
    },
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.8, ease: [0, 0, 0.2, 1] as const },
    },
  };

  const features = [0, 1, 2, 3].map((i) => ({
    title: t(`marketingHome.osLanding.features.${i}.title`),
    body: t(`marketingHome.osLanding.features.${i}.body`),
    icon: featureIcons[i],
  }));

  return (
    <div
      className="min-h-dvh overflow-x-hidden overflow-y-auto bg-[color:var(--background-main)] font-sans text-[color:var(--foreground-main)] [-webkit-overflow-scrolling:touch]"
      dir={dir}
    >
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-20%] right-[-10%] h-[800px] w-[800px] rounded-full bg-blue-500/20 blur-[120px] dark:bg-blue-600/10" />
        <div className="absolute bottom-[-20%] left-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-500/15 blur-[120px] dark:bg-emerald-500/10" />
        <div className="absolute top-[40%] left-[30%] h-[400px] w-[400px] rounded-full bg-purple-500/15 blur-[100px] dark:bg-purple-500/10" />
      </div>

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-8 py-6">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 shadow-lg shadow-blue-500/20">
            <Layers className="h-5 w-5 text-white" />
          </div>
          <span className="text-2xl font-black tracking-tight text-[color:var(--foreground-main)]">
            BSD<span className="text-blue-500">-</span>YBM{" "}
            <span className="text-lg font-medium text-[color:var(--foreground-muted)]">OS</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <LocaleSwitcher compact />
          <ThemeToggle variant="landing" />
          <button
            type="button"
            onClick={onLogin}
            className="rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-6 py-2.5 text-sm font-medium text-[color:var(--foreground-main)] shadow-sm backdrop-blur-md transition-all hover:bg-[color:var(--surface-soft)]"
          >
            {t("marketingHome.osLanding.signIn")}
          </button>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-8 pb-32 pt-20">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mx-auto flex max-w-4xl flex-col items-center text-center"
        >
          <motion.div
            variants={itemVariants}
            className="mb-8 inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-2 text-sm font-semibold text-blue-600 dark:text-blue-400"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
            </span>
            {t("marketingHome.osLanding.badge")}
          </motion.div>

          <motion.h1 variants={itemVariants} className="mb-8 text-6xl font-black leading-tight tracking-tighter md:text-8xl">
            {t("marketingHome.osLanding.heroTitleLine1")} <br />
            <span className="bg-gradient-to-r from-blue-400 via-indigo-400 to-emerald-400 bg-clip-text text-transparent">
              {t("marketingHome.osLanding.heroTitleLine2")}
            </span>
          </motion.h1>

          <motion.p variants={itemVariants} className="mb-12 max-w-2xl text-xl leading-relaxed text-[color:var(--foreground-muted)] md:text-2xl">
            {t("marketingHome.osLanding.heroSubtitle")}
          </motion.p>

          <motion.div variants={itemVariants} className="flex flex-col gap-4 sm:flex-row">
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
              onClick={() => router.push("/login")}
              className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-8 py-4 text-lg font-bold text-[color:var(--foreground-main)] shadow-sm backdrop-blur-sm transition-all hover:bg-[color:var(--surface-soft)]"
            >
              {t("marketingHome.osLanding.ctaDemo")}
            </button>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 1 }}
          className="mt-32 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
        >
          {features.map((feature, index) => (
            <FeatureCard
              key={feature.title}
              icon={<feature.icon className="h-6 w-6 text-emerald-400" />}
              title={feature.title}
              description={feature.body}
              delay={0.1 * (index + 1)}
            />
          ))}
        </motion.div>
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.8 + delay, duration: 0.5 }}
      className="rounded-3xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/80 p-6 backdrop-blur-md transition-colors hover:bg-[color:var(--surface-soft)]"
    >
      <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-[color:var(--surface-soft)]">{icon}</div>
      <h3 className="mb-3 text-xl font-bold text-[color:var(--foreground-main)]">{title}</h3>
      <p className="text-sm leading-relaxed text-[color:var(--foreground-muted)]">{description}</p>
    </motion.div>
  );
}
