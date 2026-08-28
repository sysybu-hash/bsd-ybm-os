"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { widgetScrollPaneClass } from "@/lib/workspace/widget-shell-layout";

export type HubTabDef = {
  id: string;
  labelKey: string;
  /** תווית קצרה למובייל (אופציונלי) */
  shortLabelKey?: string;
};

type Props = {
  tabs: HubTabDef[];
  initialTab?: string | null;
  onTabChange?: (tabId: string) => void;
  renderTab: (tabId: string) => ReactNode;
  /** מספר טאבים (לתגית נגישות) */
  tabCountLabel?: string | null;
};

export default function WidgetHubShell({
  tabs,
  initialTab,
  onTabChange,
  renderTab,
  tabCountLabel,
}: Props) {
  const { t, dir } = useI18n();
  const defaultTab = tabs[0]?.id ?? "";
  const [activeTab, setActiveTab] = useState(() => {
    if (initialTab && tabs.some((tab) => tab.id === initialTab)) return initialTab;
    return defaultTab;
  });

  // Follow `initialTab` when the host changes it, during render rather than in
  // an effect. `tabs` is deliberately not part of the comparison: it is a fresh
  // array on most parent renders, and the old effect re-ran on every one of them.
  const [lastInitialTab, setLastInitialTab] = useState(initialTab);
  if (initialTab !== lastInitialTab) {
    setLastInitialTab(initialTab);
    if (initialTab && tabs.some((tab) => tab.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }

  const selectTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      onTabChange?.(tabId);
    },
    [onTabChange],
  );

  const showTabBar = tabs.length > 0;

  return (
    <div data-widget-sticky-chrome className="flex h-full min-h-[280px] flex-1 flex-col overflow-hidden bg-[color:var(--background-main)]">
      {showTabBar ? (
      <div
        className="shrink-0 border-b border-[color:var(--border-main)] px-2 pb-1.5 pt-1.5"
        style={{ paddingInlineEnd: "max(0.5rem, env(safe-area-inset-inline-end))" }}
      >
        <nav
          className="flex gap-1 overflow-x-auto overscroll-x-contain"
          role="tablist"
          aria-label={t("workspaceWidgets.hubs.tabListAria")}
          dir={dir}
        >
          {tabs.map((tab) => {
            const selected = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => selectTab(tab.id)}
                className={`shrink-0 rounded-lg px-2 py-1.5 text-[10px] font-bold transition-colors md:px-2.5 md:text-xs ${
                  selected
                    ? "text-[color:var(--win-accent,#6366f1)]"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
                style={
                  selected
                    ? { background: "color-mix(in srgb, var(--win-accent, #6366f1) 15%, transparent)" }
                    : undefined
                }
              >
                <span className="md:hidden">{t(tab.shortLabelKey ?? tab.labelKey)}</span>
                <span className="hidden md:inline">{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </nav>
        {tabCountLabel ? (
          <p className="mt-1 hidden px-1 text-[10px] font-semibold text-[color:var(--foreground-muted)] md:block">
            {tabCountLabel}
          </p>
        ) : null}
      </div>
      ) : null}
      <div data-widget-scroll-pane className={`relative ${widgetScrollPaneClass}`}>
        {renderTab(activeTab)}
      </div>
    </div>
  );
}
