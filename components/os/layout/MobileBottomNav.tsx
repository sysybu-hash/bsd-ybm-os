"use client";

import React from "react";
import type { LucideIcon } from "lucide-react";
import { FileText, LayoutDashboard, Mic, ScanLine, Users } from "lucide-react";
import { WidgetType } from "@/hooks/use-window-manager";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";

export type MobileBottomNavProps = {
  openWidget: (type: WidgetType) => void;
  onOpenOmnibar: () => void;
};

type NavItem = { type: WidgetType; labelKey: string; icon: LucideIcon; chip?: boolean };

const leftItems: NavItem[] = [
  { type: "dashboard", labelKey: "workspaceWidgets.mobileNav.dashboard", icon: LayoutDashboard },
  { type: "aiScanner", labelKey: "workspaceWidgets.mobileNav.aiScanner", icon: ScanLine },
];

const rightItems: NavItem[] = [
  { type: "meckanoReports", labelKey: "workspaceWidgets.mobileNav.meckanoReports", icon: FileText, chip: true },
  { type: "crmTable", labelKey: "workspaceWidgets.mobileNav.crmTable", icon: Users, chip: true },
];

function SideNavButton({
  item,
  onOpen,
  label,
}: {
  item: NavItem;
  onOpen: (t: WidgetType) => void;
  label: string;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onOpen(item.type)}
      className={`flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 transition active:scale-95 ${
        item.chip
          ? "group text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
      }`}
      aria-label={label}
    >
      {item.chip ? (
        <span
          className={`flex h-9 w-9 max-[380px]:h-8 max-[380px]:w-8 shrink-0 items-center justify-center rounded-lg transition sm:h-10 sm:w-10 sm:rounded-xl ${widgetIconChipClass(item.type)}`}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden />
        </span>
      ) : (
        <Icon size={21} strokeWidth={1.75} className="max-[380px]:h-[19px] max-[380px]:w-[19px] shrink-0 sm:h-[22px] sm:w-[22px]" aria-hidden />
      )}
      <span
        className={`max-w-full truncate px-0.5 text-[8px] font-bold leading-tight sm:text-[9px] ${
          item.chip ? "text-[color:var(--foreground-muted)] group-hover:text-[color:var(--foreground-main)]" : ""
        }`}
      >
        {label}
      </span>
    </button>
  );
}

export default function MobileBottomNav({ openWidget, onOpenOmnibar }: MobileBottomNavProps) {
  const { t, dir } = useI18n();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[100] grid min-h-[56px] max-w-[100vw] items-end gap-0 border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-0.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) auto minmax(0, 1fr) minmax(0, 1fr)",
      }}
      aria-label={t("workspaceWidgets.mobileNav.aria")}
      data-testid="mobile-bottom-nav"
      dir={dir}
    >
      {leftItems.map((item) => (
        <SideNavButton key={item.type} item={item} onOpen={openWidget} label={t(item.labelKey)} />
      ))}

      <div className="flex items-end justify-center self-end px-0.5 pb-0.5">
        <button
          type="button"
          onClick={onOpenOmnibar}
          className="flex h-11 w-11 min-h-[44px] min-w-[44px] max-[380px]:h-10 max-[380px]:w-10 max-[380px]:min-h-10 max-[380px]:min-w-10 -translate-y-1.5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md shadow-indigo-900/25 ring-2 ring-[color:var(--background-main)] transition hover:bg-indigo-500 active:scale-95 min-[400px]:h-12 min-[400px]:w-12 min-[400px]:min-h-[48px] min-[400px]:min-w-[48px] min-[400px]:-translate-y-2 sm:h-14 sm:w-14 sm:min-h-[56px] sm:min-w-[56px] sm:-translate-y-2.5 sm:ring-4"
          aria-label={t("workspaceWidgets.mobileNav.omnibarAria")}
        >
          <Mic size={22} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {rightItems.map((item) => (
        <SideNavButton key={item.type} item={item} onOpen={openWidget} label={t(item.labelKey)} />
      ))}
    </nav>
  );
}
