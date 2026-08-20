"use client";

import { useCallback, useState } from "react";
import { Package } from "lucide-react";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import LogisticsAssetsTab from "@/components/os/widgets/logistics/LogisticsAssetsTab";
import LogisticsInventoryTab from "@/components/os/widgets/logistics/LogisticsInventoryTab";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const TABS: HubTabDef[] = [
  { id: "inventory", labelKey: "workspaceWidgets.hubs.logistics.tabs.inventory" },
  { id: "assets", labelKey: "workspaceWidgets.hubs.logistics.tabs.assets" },
];

type Props = {
  liveData?: Record<string, unknown> | null;
};

export default function LogisticsHubWidget({ liveData }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "inventory";
  const [activeTab, setActiveTab] = useState(initialTab);

  const applyView = useCallback((view: WidgetViewState) => {
    const tab = view.tab;
    if (typeof tab === "string" && TABS.some((row) => row.id === tab)) {
      setActiveTab(tab);
    }
  }, []);

  const { pushView } = useSyncedWidgetNavigation(applyView);

  const handleTabChange = useCallback(
    (tabId: string) => {
      setActiveTab(tabId);
      pushView({ tab: tabId });
    },
    [pushView],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[color:var(--background-main)]">
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-4 py-4 md:px-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[color:var(--foreground-main)] md:text-2xl">
          <Package className="h-6 w-6 text-[color:var(--brand-accent)]" />
          {t("workspaceWidgets.titles.logisticsHub")}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.logistics.subtitle")}
        </p>
      </div>
      <WidgetHubShell
        tabs={TABS}
        initialTab={activeTab}
        onTabChange={handleTabChange}
        tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
        renderTab={(tabId) =>
          tabId === "assets" ? <LogisticsAssetsTab /> : <LogisticsInventoryTab />
        }
      />
    </div>
  );
}
