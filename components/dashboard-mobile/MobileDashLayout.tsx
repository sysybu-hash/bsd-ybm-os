"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import DashboardClock from "@/components/dashboard/DashboardClock";
import MobileTabNav from "@/components/dashboard-mobile/MobileTabNav";

export default function MobileDashLayout({ children }: { children: React.ReactNode }) {
  const { t, dir } = useI18n();

  return (
    <div
      dir={dir}
      className="flex h-[100dvh] flex-col overflow-hidden bg-[color:var(--background-main)] text-[color:var(--foreground-main)]"
    >
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-3 py-2.5 backdrop-blur-xl"
        style={{ paddingTop: "max(0.625rem, env(safe-area-inset-top))" }}
      >
        <Link
          href="/workspace"
          aria-label={t("workspaceWidgets.mobileNav.backToOS")}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition hover:text-[color:var(--foreground-main)] active:scale-95"
        >
          <ArrowRight size={18} className="rtl:rotate-0 ltr:rotate-180" aria-hidden />
        </Link>

        <h1 className="text-base font-extrabold tracking-tight text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.classicDashboard.title")}
        </h1>

        <DashboardClock />
      </header>

      {/* Scrollable content — padded so it doesn't hide under the fixed bottom nav */}
      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom))" }}
      >
        {children}
      </main>

      <MobileTabNav />
    </div>
  );
}
