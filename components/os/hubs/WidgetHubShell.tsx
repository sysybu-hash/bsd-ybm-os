"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

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

  useEffect(() => {
    if (initialTab && tabs.some((tab) => tab.id === initialTab)) {
      setActiveTab(initialTab);
    }
  }, [initialTab, tabs]);

  const selectTab = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      onTabChange?.(tabId);
    },
    [onTabChange],
  );

  const showTabBar = tabs.length > 0;

  return (
    <div className="flex h-full min-h-[280px] flex-1 flex-col overflow-hidden bg-[color:var(--background-main)]">
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
                    ? "bg-amber-500/15 text-amber-800 dark:text-amber-200"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
                }`}
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
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {renderTab(activeTab)}
      </div>
    </div>
  );
}
