"use client";

import React, { useEffect, useState } from "react";
import { Bell, LayoutGrid, LogOut, Settings, Zap } from "lucide-react";
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
}

export default function OSHeader({
  openWidget,
  notificationsCount,
  isNotificationsOpen,
  toggleNotifications,
  bellButtonRef,
  isCleanDashboard = false,
  onToggleWorkState,
}: OSHeaderProps) {
  const { data: session } = useSession();
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);

  const userName = session?.user?.name || t("workspaceWidgets.page.defaultUser");
  const userInitials = userName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "OS";

  useEffect(() => setMounted(true), []);

  return (
    <header className="absolute left-0 right-0 top-0 z-[1000] flex h-16 items-center justify-between border-b border-[color:var(--border-main)] bg-[color:var(--glass-bg)] px-4 shadow-xs backdrop-blur-sm md:px-6">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white shadow-sm">
            <Zap size={18} className="fill-white" aria-hidden />
          </div>
          <div className="hidden sm:block">
            <div className="text-xs font-black tracking-[0.16em] text-[color:var(--foreground-main)]">
              BSD-YBM <span className="text-indigo-600 dark:text-indigo-400">OS</span>
            </div>
            <div className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">{t("workspaceNav.logoSubtitle")}</div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        {mounted && (
          <>
            <button
              ref={bellButtonRef}
              type="button"
              onClick={toggleNotifications}
              className={`relative flex min-h-11 min-w-11 items-center justify-center rounded-lg border transition ${
                isNotificationsOpen
                  ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                  : "border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
              }`}
              title={t("workspaceShell.topBar.notificationsAria")}
              aria-label={t("workspaceWidgets.page.notificationsOpen")}
              aria-pressed={isNotificationsOpen}
            >
              <Bell size={15} aria-hidden />
              {notificationsCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-black text-white">
                  {notificationsCount}
                </span>
              )}
            </button>

            {onToggleWorkState ? (
              <button
                type="button"
                onClick={onToggleWorkState}
                className={`flex min-h-11 min-w-11 items-center justify-center rounded-lg border transition ${
                  isCleanDashboard
                    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                    : "border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
                title={isCleanDashboard ? t("workspaceWidgets.page.backToWork") : t("workspaceWidgets.page.cleanDashboard")}
                aria-label={isCleanDashboard ? t("workspaceWidgets.page.backToWork") : t("workspaceWidgets.page.cleanDashboard")}
                aria-pressed={isCleanDashboard}
              >
                <LayoutGrid size={15} aria-hidden />
              </button>
            ) : null}

            <LocaleSwitcher compact />

            <ThemeToggle />
          </>
        )}

        <div className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-1 shadow-xs">
          <button
            type="button"
            onClick={() => openWidget?.("settings")}
            className="group flex items-center gap-3 rounded-md py-1 pl-1 pr-2 transition hover:bg-[color:var(--surface-soft)]"
            aria-label={t("workspaceWidgets.page.settingsOpen")}
          >
            <div className="hidden flex-col items-end md:flex">
              <span className="text-[11px] font-bold leading-tight text-[color:var(--foreground-main)]">{userName}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider text-[color:var(--foreground-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Online
              </span>
            </div>
            <div className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-md border border-[color:var(--border-main)] bg-slate-800 text-[10px] font-black text-white">
              {session?.user?.image ? (
                <Image src={session.user.image} alt={userName} fill className="object-cover" />
              ) : (
                userInitials
              )}
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-indigo-600/85 opacity-0 transition-opacity group-hover:opacity-100">
                <Settings size={13} aria-hidden />
              </div>
            </div>
          </button>

          <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-md p-2 text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-600"
            title={t("workspaceNav.signOut")}
            aria-label={t("workspaceWidgets.page.signOut")}
          >
            <LogOut size={15} aria-hidden />
          </button>
        </div>
      </div>
    </header>
  );
}
