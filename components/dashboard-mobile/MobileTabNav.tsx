"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, FolderKanban, Grid3x3, ScanLine, Users } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

type Tab = {
  href: string;
  labelKey: string;
  icon: React.ElementType;
  fab?: boolean;
};

const TABS: ReadonlyArray<Tab> = [
  { href: "/m/dashboard/crm",      labelKey: "workspaceWidgets.classicDashboard.tabs.crm",    icon: Users },
  { href: "/m/dashboard/projects", labelKey: "workspaceWidgets.classicDashboard.tabs.tasks",  icon: FolderKanban },
  { href: "/m/dashboard/scanner",  labelKey: "workspaceWidgets.classicDashboard.tabs.scan",   icon: ScanLine, fab: true },
  { href: "/m/dashboard/ai",       labelKey: "workspaceWidgets.classicDashboard.tabs.aiChat", icon: Bot },
  { href: "/m/dashboard/more",     labelKey: "workspaceWidgets.mobileNav.moreApps",           icon: Grid3x3 },
];

export default function MobileTabNav() {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <nav
      aria-label={t("workspaceWidgets.mobileNav.aria")}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 backdrop-blur-md"
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-end justify-around px-1 pt-1">
        {TABS.map(({ href, labelKey, icon: Icon, fab }) => {
          const active = pathname.startsWith(href);
          if (fab) {
            return (
              <Link
                key={href}
                href={href}
                aria-label={t(labelKey)}
                aria-current={active ? "page" : undefined}
                className="flex flex-col items-center gap-1 pb-0.5"
              >
                <span
                  className={`-mt-5 flex h-14 w-14 items-center justify-center rounded-full border-4 border-[color:var(--background-main)] shadow-lg transition active:scale-95 ${
                    active
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-indigo-600 text-white"
                  }`}
                >
                  <Icon size={24} strokeWidth={1.75} aria-hidden />
                </span>
                <span
                  className={`text-[9px] font-bold leading-tight ${
                    active ? "text-[color:var(--accent)]" : "text-[color:var(--foreground-muted)]"
                  }`}
                >
                  {t(labelKey)}
                </span>
              </Link>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[44px] min-w-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1 transition active:scale-95 ${
                active
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
              }`}
            >
              {active ? (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--accent-soft)]">
                  <Icon size={18} strokeWidth={2} aria-hidden />
                </span>
              ) : (
                <Icon size={22} strokeWidth={1.75} aria-hidden />
              )}
              <span className="text-[9px] font-bold leading-tight">{t(labelKey)}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
