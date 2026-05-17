"use client";

import React, { useEffect, useState } from "react";
import { Bell, Layers, LayoutGrid, LogOut, Settings, Shield, Zap } from "lucide-react";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { signOut, useSession } from "next-auth/react";
import Image from "next/image";
import { WidgetType } from "@/hooks/use-window-manager";
import LocaleSwitcher from "@/components/os/system/LocaleSwitcher";
import ThemeToggle from "@/components/os/system/ThemeToggle";
import { useI18n } from "@/components/os/system/I18nProvider";

interface OSHeaderProps {
  openWidget?: (type: WidgetType) => void;
  notificationsCount: number;
  isNotificationsOpen: boolean;
  toggleNotifications: () => void;
  bellButtonRef?: React.Ref<HTMLButtonElement>;
  isCleanDashboard?: boolean;
  onToggleWorkState?: () => void;
  onOpenWindowSwitcher?: () => void;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

const HeaderIconButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }
>(function HeaderIconButton({ children, className, active, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-150",
        active
          ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-300"
          : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

function ToolbarDivider() {
  return <span className="mx-0.5 hidden h-5 w-px shrink-0 bg-[color:var(--border-main)]/70 sm:block" aria-hidden />;
}

export default function OSHeader({
  openWidget,
  notificationsCount,
  isNotificationsOpen,
  toggleNotifications,
  bellButtonRef,
  isCleanDashboard = false,
  onToggleWorkState,
  onOpenWindowSwitcher,
}: OSHeaderProps) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [mounted, setMounted] = useState(false);

  const userName = session?.user?.name || t("workspaceWidgets.page.defaultUser");
  const userInitials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "OS";

  useEffect(() => setMounted(true), []);

  const toolbarAria =
    t("workspaceShell.topBar.toolbarAria") !== "workspaceShell.topBar.toolbarAria"
      ? t("workspaceShell.topBar.toolbarAria")
      : "פעולות סרגל עליון";

  return (
    <header className="absolute inset-x-0 top-0 z-[1000] max-w-[100vw] border-b border-[color:var(--border-main)]/80 bg-[color:var(--glass-bg)]/95 px-3 pb-2.5 pt-[max(0.65rem,env(safe-area-inset-top,0px))] shadow-[0_1px_0_rgba(255,255,255,0.04)_inset] backdrop-blur-md md:px-5">
      <div className="mx-auto flex min-h-[3.25rem] max-w-[88rem] items-center gap-2 sm:gap-3">
        {/* מיתוג */}
        <div className="flex min-w-0 flex-1 items-center gap-2.5 sm:gap-3">
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/15"
            aria-hidden
          >
            <Zap size={18} className="fill-white/90" />
          </div>
          <div className="min-w-0 hidden sm:block">
            <p className="truncate text-[13px] font-black leading-tight tracking-wide text-[color:var(--foreground-main)]">
              BSD-YBM <span className="text-indigo-500 dark:text-indigo-400">OS</span>
            </p>
            <p className="truncate text-[10px] font-semibold leading-tight text-[color:var(--foreground-muted)]">
              {t("workspaceNav.logoSubtitle")}
            </p>
          </div>
        </div>

        {/* כלי עבודה מרכזיים */}
        {mounted ? (
          <nav
            className="flex shrink-0 items-center gap-0.5 rounded-xl border border-[color:var(--border-main)]/90 bg-[color:var(--surface-card)]/70 p-1 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]"
            aria-label={toolbarAria}
          >
            <HeaderIconButton
              ref={bellButtonRef}
              onClick={toggleNotifications}
              active={isNotificationsOpen}
              className="relative"
              title={t("workspaceShell.topBar.notificationsAria")}
              aria-label={t("workspaceWidgets.page.notificationsOpen")}
              aria-pressed={isNotificationsOpen}
            >
              <Bell size={16} aria-hidden />
              {notificationsCount > 0 ? (
                <span className="absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-black text-white shadow-sm">
                  {notificationsCount > 9 ? "9+" : notificationsCount}
                </span>
              ) : null}
            </HeaderIconButton>

            {onOpenWindowSwitcher ? (
              <>
                <ToolbarDivider />
                <HeaderIconButton
                  onClick={onOpenWindowSwitcher}
                  className="hidden md:flex"
                  title={t("workspaceWidgets.windowSwitcher.title")}
                  aria-label={t("workspaceWidgets.windowSwitcher.title")}
                >
                  <Layers size={16} aria-hidden />
                </HeaderIconButton>
              </>
            ) : null}

            {onToggleWorkState ? (
              <HeaderIconButton
                onClick={onToggleWorkState}
                active={isCleanDashboard}
                title={isCleanDashboard ? t("workspaceWidgets.page.backToWork") : t("workspaceWidgets.page.cleanDashboard")}
                aria-label={isCleanDashboard ? t("workspaceWidgets.page.backToWork") : t("workspaceWidgets.page.cleanDashboard")}
                aria-pressed={isCleanDashboard}
              >
                <LayoutGrid size={16} aria-hidden />
              </HeaderIconButton>
            ) : null}

            {isPlatformAdmin && openWidget ? (
              <HeaderIconButton
                onClick={() => openWidget("platformAdmin")}
                className="hidden sm:flex"
                title={t("workspaceWidgets.sidebar.platformAdmin")}
                aria-label={t("workspaceWidgets.sidebar.platformAdmin")}
              >
                <Shield size={16} aria-hidden />
              </HeaderIconButton>
            ) : null}

            <ToolbarDivider />

            <LocaleSwitcher compact embedded />

            <ThemeToggle variant="toolbar" />
          </nav>
        ) : (
          <div className="h-11 w-[min(12rem,42vw)] shrink-0 rounded-xl border border-[color:var(--border-main)]/50 bg-[color:var(--surface-card)]/40" aria-hidden />
        )}

        {/* משתמש */}
        <div className="flex min-w-0 flex-1 items-center justify-end">
          <div className="flex max-w-full items-center gap-0.5 rounded-xl border border-[color:var(--border-main)]/90 bg-[color:var(--surface-card)]/80 p-1 shadow-sm ring-1 ring-black/[0.04] dark:ring-white/[0.06]">
            <button
              type="button"
              onClick={() => openWidget?.("settings")}
              className="group flex min-w-0 items-center gap-2 rounded-lg py-0.5 ps-1.5 pe-2 transition hover:bg-[color:var(--surface-soft)]"
              aria-label={t("workspaceWidgets.page.settingsOpen")}
            >
              <div className="hidden min-w-0 flex-col items-end text-end md:flex">
                <span className="max-w-[8.5rem] truncate text-[11px] font-bold leading-tight text-[color:var(--foreground-main)]">
                  {userName}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[9px] font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.55)]" />
                  {t("workspaceWidgets.page.statusOnline")}
                </span>
              </div>
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[color:var(--border-main)]/80 bg-gradient-to-br from-slate-700 to-slate-900 text-[10px] font-black text-white">
                {session?.user?.image ? (
                  <Image src={session.user.image} alt={userName} fill className="object-cover" sizes="36px" />
                ) : (
                  userInitials
                )}
                <div className="absolute inset-0 flex items-center justify-center bg-indigo-600/90 opacity-0 transition-opacity group-hover:opacity-100">
                  <Settings size={14} aria-hidden />
                </div>
              </div>
            </button>

            <span className="mx-0.5 h-6 w-px shrink-0 bg-[color:var(--border-main)]/70" aria-hidden />

            <HeaderIconButton
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="hover:bg-rose-500/10 hover:text-rose-500 dark:hover:text-rose-400"
              title={t("workspaceNav.signOut")}
              aria-label={t("workspaceWidgets.page.signOut")}
            >
              <LogOut size={16} aria-hidden />
            </HeaderIconButton>
          </div>
        </div>
      </div>
    </header>
  );
}
