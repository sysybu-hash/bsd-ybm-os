"use client";

import React, { useLayoutEffect } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import DashboardClock from "@/components/dashboard/DashboardClock";
import MobileTabNav from "@/components/dashboard-mobile/MobileTabNav";

/** Keep classic mobile bright even when the global OS theme is dark. */
function ForceLightTheme() {
  useLayoutEffect(() => {
    const el = document.documentElement;
    const hadDark = el.classList.contains("dark");
    el.classList.remove("dark");
    el.classList.add("light");
    const prevScheme = el.style.colorScheme;
    el.style.colorScheme = "light";
    return () => {
      if (hadDark) {
        el.classList.add("dark");
        el.classList.remove("light");
      }
      el.style.colorScheme = prevScheme;
    };
  }, []);
  return null;
}

export default function MobileDashLayout({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n();

  return (
    <div
      dir={dir}
      className="dashboard-theme flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
    >
      <ForceLightTheme />
      <header
        className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--classic-rule)] bg-[color:var(--glass-bg)] px-3 py-2"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <Link
          href="/home"
          aria-label={t("workspaceWidgets.mobileNav.backToOS")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--classic-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--classic-ink)] active:scale-95"
        >
          <ArrowRight size={18} className="rtl:rotate-0 ltr:rotate-180" aria-hidden />
        </Link>

        <h1 className="text-base font-bold tracking-tight text-[color:var(--classic-ink)]">
          {t("workspaceWidgets.classicDashboard.title")}
        </h1>

        <DashboardClock />
      </header>

      <main
        className="dashboard-main min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <MobileTabNav />
    </div>
  );
}
