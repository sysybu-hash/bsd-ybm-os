"use client";

import React, { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Accessibility, Grid3x3, Layers, MessageSquare, Mic, Shield, X } from "lucide-react";
import MobileChromeFabButton from "@/components/os/layout/MobileChromeFabButton";
import { openAccessibilityPanel, openFeedbackFab } from "@/lib/mobile-chrome-events";
import { WidgetType } from "@/hooks/use-window-manager";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import { helpIconChipClass, widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import { getLauncherNavMeta, mobileNavLabelKey } from "@/lib/launcher/launcher-icons";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import { useMobileChromeBottomSync } from "@/hooks/use-mobile-chrome-bottom-sync";

export type MobileBottomNavProps = {
  openWidget: (type: WidgetType) => void;
  onOpenOmnibar: () => void;
  onOpenWindowSwitcher?: () => void;
  /** Hide the floating center button while the omnibar sheet is open. */
  omnibarOpen?: boolean;
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
  omnibarOpen = false,
}: MobileBottomNavProps) {
  const { t, dir } = useI18n();
  const isPlatformAdmin = useIsPlatformAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const { zoneSlots } = useLauncherConfig();
  const hostRef = useMobileChromeBottomSync(omnibarOpen);

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
          className="fixed inset-0 z-[1284] bg-slate-950/50 backdrop-blur-sm md:hidden"
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

      {/* ── סרגל תחתון + מיקרופון שקוע במרכז (חצי בפנים, חצי בחוץ) ── */}
      <div
        ref={hostRef}
        className="mobile-bottom-nav-host fixed bottom-0 left-0 right-0 z-[1285] md:hidden"
        data-testid="mobile-bottom-nav"
        dir={dir}
      >
        <nav
          className="mobile-bottom-nav-bar flex max-w-[100vw] flex-col gap-0 border-t border-[color:var(--border-main)] bg-[color:var(--glass-bg)]/95 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] backdrop-blur-md"
          aria-label={t("workspaceWidgets.mobileNav.aria")}
        >
          {/* לשוניות קצה — רק בפינות, לא מרחיבות מרווח תוכן */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-full flex items-end justify-between"
            aria-label={t("workspaceWidgets.mobileNav.chromeActionsAria")}
          >
            <div className="pointer-events-auto -mb-px">
              <MobileChromeFabButton
                icon={MessageSquare}
                label={t("siteFeedback.fabLabel")}
                onClick={openFeedbackFab}
                testId="mobile-feedback-fab"
                variant="accent"
                shape="tab"
                corner="start"
              />
            </div>
            <div className="pointer-events-auto -mb-px">
              <MobileChromeFabButton
                icon={Accessibility}
                label={t("accessibility.toolbar")}
                onClick={openAccessibilityPanel}
                testId="mobile-accessibility-fab"
                shape="tab"
                corner="end"
              />
            </div>
          </div>

          <div className="mobile-bottom-nav-icon-row flex items-end gap-0 px-0.5 pb-[max(0.125rem,env(safe-area-inset-bottom))]">
            <NavSideGrid>
              <SortableLauncherZone
                zone="mobileBarStart"
                variant="mobile"
                onOpen={openWidget}
                className="contents"
              />
            </NavSideGrid>

            <div className="mobile-bottom-nav-mic-wrap flex shrink-0 items-end justify-center px-1">
              {!omnibarOpen ? (
                <button
                  type="button"
                  onClick={onOpenOmnibar}
                  className="mobile-bottom-nav-mic relative -translate-y-3 flex h-16 w-16 min-h-[64px] min-w-[64px] items-center justify-center rounded-full border border-white/30 bg-indigo-600 text-white shadow-[0_14px_28px_rgba(79,70,229,0.45)] ring-4 ring-[color:var(--glass-bg)] transition hover:bg-indigo-500 active:scale-95 sm:h-[4.5rem] sm:w-[4.5rem] sm:min-h-[4.5rem] sm:min-w-[4.5rem]"
                  aria-label={t("workspaceWidgets.mobileNav.omnibarAria")}
                >
                  <Mic size={28} strokeWidth={2} aria-hidden />
                </button>
              ) : null}
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
          </div>
        </nav>
      </div>
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
      className="fixed bottom-[calc(var(--mobile-chrome-bottom)+0.5rem)] left-3 right-3 z-[1286] max-h-[50vh] overflow-y-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 shadow-xl md:hidden"
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
