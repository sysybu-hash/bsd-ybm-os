"use client";

import React, { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  FilePlus,
  FileText,
  Grid3x3,
  HardDrive,
  HelpCircle,
  LayoutDashboard,
  Layers,
  Library,
  Mic,
  Package,
  ScanLine,
  Settings,
  Shield,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { WidgetType } from "@/hooks/use-window-manager";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { helpIconChipClass, widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";

export type MobileBottomNavProps = {
  openWidget: (type: WidgetType) => void;
  onOpenOmnibar: () => void;
  onOpenWindowSwitcher?: () => void;
};

type NavItem = { type: WidgetType; labelKey: string; icon: LucideIcon; chip?: boolean };

const primaryLeft: NavItem[] = [
  { type: "dashboard", labelKey: "workspaceWidgets.mobileNav.dashboard", icon: LayoutDashboard },
  { type: "aiScanner", labelKey: "workspaceWidgets.mobileNav.aiScanner", icon: ScanLine },
];

const primaryRight: NavItem[] = [
  { type: "meckanoReports", labelKey: "workspaceWidgets.mobileNav.meckanoReports", icon: FileText, chip: true },
  { type: "crmTable", labelKey: "workspaceWidgets.mobileNav.crmTable", icon: Users, chip: true },
];

const moreApps: NavItem[] = [
  { type: "projectBoard", labelKey: "workspaceWidgets.sidebar.projectBoard", icon: BarChart3, chip: true },
  { type: "erpArchive", labelKey: "workspaceWidgets.sidebar.erpArchive", icon: Package, chip: true },
  { type: "docCreator", labelKey: "workspaceWidgets.sidebar.docCreator", icon: FilePlus, chip: true },
  { type: "aiChatFull", labelKey: "workspaceWidgets.sidebar.aiChatFull", icon: Sparkles, chip: true },
  { type: "notebookLM", labelKey: "workspaceWidgets.sidebar.notebookLM", icon: Library, chip: true },
  { type: "googleDrive", labelKey: "workspaceWidgets.titles.googleDrive", icon: HardDrive, chip: true },
  { type: "helpCenter", labelKey: "workspaceWidgets.sidebar.help", icon: HelpCircle, chip: true },
  { type: "settings", labelKey: "workspaceWidgets.sidebar.settings", icon: Settings, chip: true },
  { type: "accessibility", labelKey: "workspaceWidgets.titles.accessibility", icon: Settings, chip: true },
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
      className="flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)] active:scale-95"
      aria-label={label}
    >
      {item.chip ? (
        <span
          className={`flex h-9 w-9 max-[380px]:h-8 max-[380px]:w-8 shrink-0 items-center justify-center rounded-lg transition sm:h-10 sm:w-10 sm:rounded-xl ${
            item.type === "helpCenter" ? helpIconChipClass : widgetIconChipClass(item.type)
          }`}
        >
          <Icon size={20} strokeWidth={1.75} aria-hidden />
        </span>
      ) : (
        <Icon size={21} strokeWidth={1.75} className="max-[380px]:h-[19px] max-[380px]:w-[19px] shrink-0 sm:h-[22px] sm:w-[22px]" aria-hidden />
      )}
      <span className="max-w-full truncate px-0.5 text-[8px] font-bold leading-tight sm:text-[9px]">{label}</span>
    </button>
  );
}

export default function MobileBottomNav({
  openWidget,
  onOpenOmnibar,
  onOpenWindowSwitcher,
}: MobileBottomNavProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [moreOpen, setMoreOpen] = useState(false);

  const moreAppsWithAdmin: NavItem[] = isPlatformAdmin
    ? [
        ...moreApps,
        {
          type: "platformAdmin" as WidgetType,
          labelKey: "workspaceWidgets.sidebar.platformAdmin",
          icon: Shield,
          chip: true,
        },
      ]
    : moreApps;

  return (
    <>
      {moreOpen ? (
        <button
          type="button"
          className="fixed inset-0 z-[110] bg-slate-950/50 backdrop-blur-sm md:hidden"
          aria-label={t("workspaceWidgets.mobileNav.closeMore")}
          onClick={() => setMoreOpen(false)}
        />
      ) : null}
      {moreOpen ? (
        <MoreAppsPanel
          t={t}
          apps={moreAppsWithAdmin}
          onClose={() => setMoreOpen(false)}
          onOpen={(type: WidgetType) => {
            openWidget(type);
            setMoreOpen(false);
          }}
        />
      ) : null}

      <nav
        className="fixed bottom-0 left-0 right-0 z-[100] grid min-h-[56px] max-w-[100vw] items-end gap-0 border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-0.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md md:hidden"
        style={{
          gridTemplateColumns:
            "minmax(0,1fr) minmax(0,1fr) auto minmax(0,1fr) minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)",
        }}
        aria-label={t("workspaceWidgets.mobileNav.aria")}
        data-testid="mobile-bottom-nav"
        dir={dir}
      >
        {primaryLeft.map((item) => (
          <SideNavButton key={item.type} item={item} onOpen={openWidget} label={t(item.labelKey)} />
        ))}

        <div className="flex items-end justify-center self-end px-0.5 pb-0.5">
          <button
            type="button"
            onClick={onOpenOmnibar}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] -translate-y-1.5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md ring-2 ring-[color:var(--background-main)] transition hover:bg-indigo-500 active:scale-95 sm:h-14 sm:w-14 sm:-translate-y-2.5"
            aria-label={t("workspaceWidgets.mobileNav.omnibarAria")}
          >
            <Mic size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>

        {onOpenWindowSwitcher ? (
          <button
            type="button"
            onClick={onOpenWindowSwitcher}
            className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            aria-label={t("workspaceWidgets.mobileNav.windowSwitcher")}
          >
            <Layers size={21} strokeWidth={1.75} aria-hidden />
            <span className="max-w-full truncate px-0.5 text-[8px] font-bold">{t("workspaceWidgets.mobileNav.windowSwitcher")}</span>
          </button>
        ) : (
          <span />
        )}

        <button
          type="button"
          onClick={() => setMoreOpen(true)}
          className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
          aria-label={t("workspaceWidgets.mobileNav.moreApps")}
          aria-expanded={moreOpen}
        >
          <Grid3x3 size={21} strokeWidth={1.75} aria-hidden />
          <span className="max-w-full truncate px-0.5 text-[8px] font-bold">{t("workspaceWidgets.mobileNav.moreApps")}</span>
        </button>

        {primaryRight.map((item) => (
          <SideNavButton key={item.type} item={item} onOpen={openWidget} label={t(item.labelKey)} />
        ))}
      </nav>
    </>
  );
}

function MoreAppsPanel({
  t,
  apps,
  onClose,
  onOpen,
}: {
  t: (key: string) => string;
  apps: NavItem[];
  onClose: () => void;
  onOpen: (type: WidgetType) => void;
}) {
  return (
    <div
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[111] max-h-[50vh] overflow-y-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 shadow-xl md:hidden"
      role="dialog"
      aria-label={t("workspaceWidgets.mobileNav.moreAppsTitle")}
    >
      <MoreAppsPanelHeader t={t} onClose={onClose} />
      <div className="grid grid-cols-4 gap-2">
        {apps.map((item) => (
          <SideNavButton key={item.type} item={item} onOpen={onOpen} label={t(item.labelKey)} />
        ))}
      </div>
    </div>
  );
}

function MoreAppsPanelHeader({ t, onClose }: { t: (key: string) => string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <span className="text-sm font-bold text-[color:var(--foreground-main)]">
        {t("workspaceWidgets.mobileNav.moreAppsTitle")}
      </span>
      <button
        type="button"
        onClick={onClose}
        className="rounded-lg p-2 hover:bg-[color:var(--surface-soft)]"
        aria-label={t("workspaceWidgets.mobileNav.closeMore")}
      >
        <X size={18} aria-hidden />
      </button>
    </div>
  );
}
