"use client";

import React, { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Accessibility, Grid3x3, Layers, MessageSquare, Mic, Shield, X } from "lucide-react";
import { OPEN_FEEDBACK_FAB_EVENT } from "@/components/feedback/SiteFeedbackFab";
import { OPEN_ACCESSIBILITY_PANEL_EVENT } from "@/components/os/system/AccessibilityToolbar";
import { WidgetType } from "@/hooks/use-window-manager";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { helpIconChipClass, widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import { getLauncherNavMeta, mobileNavLabelKey } from "@/lib/launcher/launcher-icons";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";

export type MobileBottomNavProps = {
  openWidget: (type: WidgetType) => void;
  onOpenOmnibar: () => void;
  onOpenWindowSwitcher?: () => void;
};

type NavItem = { type: WidgetType; labelKey: string; icon: LucideIcon; chip?: boolean };

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

function NavSideBalanceSlot() {
  return <span className="min-h-[44px] min-w-0" aria-hidden />;
}

function NavSideGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid min-w-0 flex-1 grid-cols-3 items-end gap-0">{children}</div>;
}

function WindowSwitcherButton({
  onOpen,
  label,
}: {
  onOpen: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)] active:scale-95"
      aria-label={label}
    >
      <Layers size={21} strokeWidth={1.75} className="max-[380px]:h-[19px] max-[380px]:w-[19px] shrink-0 sm:h-[22px] sm:w-[22px]" aria-hidden />
      <span className="max-w-full truncate px-0.5 text-[8px] font-bold leading-tight sm:text-[9px]">{label}</span>
    </button>
  );
}

function MoreNavButton({
  label,
  moreOpen,
  onOpen,
}: {
  label: string;
  moreOpen: boolean;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)] active:scale-95"
      aria-label={label}
      aria-expanded={moreOpen}
    >
      <Grid3x3 size={21} strokeWidth={1.75} className="max-[380px]:h-[19px] max-[380px]:w-[19px] shrink-0 sm:h-[22px] sm:w-[22px]" aria-hidden />
      <span className="max-w-full truncate px-0.5 text-[8px] font-bold leading-tight sm:text-[9px]">{label}</span>
    </button>
  );
}

function slotsToNavItems(slots: { widgetId: WidgetType | null }[]): NavItem[] {
  return slots
    .map((s) => s.widgetId)
    .filter((id): id is WidgetType => id !== null)
    .map((type) => {
      const meta = getLauncherNavMeta(type);
      return {
        type,
        labelKey: mobileNavLabelKey(type),
        icon: meta.icon,
        chip: meta?.chip ?? true,
      };
    });
}

export default function MobileBottomNav({
  openWidget,
  onOpenOmnibar,
  onOpenWindowSwitcher,
}: MobileBottomNavProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const { zoneSlots } = useLauncherConfig();

  const moreFromConfig = slotsToNavItems(zoneSlots("mobileMore"));
  const moreAppsWithAdmin: NavItem[] = isPlatformAdmin
    ? [
        ...moreFromConfig,
        {
          type: "platformAdmin" as WidgetType,
          labelKey: "workspaceWidgets.sidebar.platformAdmin",
          icon: Shield,
          chip: true,
        },
      ]
    : moreFromConfig;

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

      {/* ── עטיפה: קונטיינר fixed שמכיל גם את הלשוניות וגם את הסרגל ── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] md:hidden"
        data-testid="mobile-bottom-nav"
        dir={dir}
      >
        {/* ── לשוניות FAB מעל הסרגל ── */}
        <div className="flex items-end justify-between px-1 pointer-events-none" aria-hidden="true">
          {/* צד שמאל (start) — משוב */}
          <button
            type="button"
            aria-label={t("siteFeedback.fabLabel")}
            onClick={() => window.dispatchEvent(new Event(OPEN_FEEDBACK_FAB_EVENT))}
            className="pointer-events-auto flex items-center gap-1 rounded-t-xl border border-b-0 border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-3 py-1.5 text-[9px] font-bold text-[color:var(--foreground-muted)] backdrop-blur-md transition hover:text-indigo-500 active:scale-95"
          >
            <MessageSquare size={11} aria-hidden />
            {t("siteFeedback.fabLabel")}
          </button>
          {/* צד ימין (end) — נגישות */}
          <button
            type="button"
            aria-label={t("accessibility.toolbar")}
            onClick={() => window.dispatchEvent(new Event(OPEN_ACCESSIBILITY_PANEL_EVENT))}
            className="pointer-events-auto flex items-center gap-1 rounded-t-xl border border-b-0 border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-3 py-1.5 text-[9px] font-bold text-indigo-600 backdrop-blur-md transition hover:text-indigo-500 active:scale-95 dark:text-indigo-400"
          >
            {t("accessibility.toolbar")}
            <Accessibility size={11} aria-hidden />
          </button>
        </div>

      <nav
        className="flex min-h-[56px] max-w-[100vw] items-end gap-0 border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 px-0.5 pb-[max(0.35rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md"
        aria-label={t("workspaceWidgets.mobileNav.aria")}
      >
        <NavSideGrid>
          <SortableLauncherZone
            zone="mobileBarStart"
            variant="mobile"
            onOpen={openWidget}
            className="contents"
          />
        </NavSideGrid>

        <div className="flex shrink-0 items-end justify-center px-0.5 pb-0.5">
          <button
            type="button"
            onClick={onOpenOmnibar}
            className="flex h-11 w-11 min-h-[44px] min-w-[44px] -translate-y-1.5 items-center justify-center rounded-full bg-indigo-600 text-white shadow-md ring-2 ring-[color:var(--background-main)] transition hover:bg-indigo-500 active:scale-95 sm:h-14 sm:w-14 sm:-translate-y-2.5"
            aria-label={t("workspaceWidgets.mobileNav.omnibarAria")}
          >
            <Mic size={22} strokeWidth={2} aria-hidden />
          </button>
        </div>

        <NavSideGrid>
          {onOpenWindowSwitcher ? (
            <WindowSwitcherButton
              onOpen={onOpenWindowSwitcher}
              label={t("workspaceWidgets.mobileNav.windowSwitcher")}
            />
          ) : (
            <NavSideBalanceSlot />
          )}
          <SortableLauncherZone
            zone="mobileBarEnd"
            variant="mobile"
            onOpen={openWidget}
            className="contents"
          />
          <MoreNavButton
            label={t("workspaceWidgets.mobileNav.moreApps")}
            moreOpen={moreOpen}
            onOpen={() => setMoreOpen(true)}
          />
        </NavSideGrid>
      </nav>
      </div>{/* סוף עטיפת fixed */}
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
