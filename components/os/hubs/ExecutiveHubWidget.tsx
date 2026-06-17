"use client";

import ExecutiveDashboardWidget from "@/components/os/widgets/executive/ExecutiveDashboardWidget";
import ProgressBillPortalPanel from "@/components/os/widgets/progress-bills/ProgressBillPortalPanel";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import { useCallback, useState } from "react";
import { LayoutDashboard } from "lucide-react";

const TABS: HubTabDef[] = [
  { id: "overview", labelKey: "workspaceWidgets.hubs.executive.tabs.overview" },
  { id: "progressBills", labelKey: "workspaceWidgets.hubs.executive.tabs.progressBills" },
];

type Props = {
  liveData?: Record<string, unknown> | null;
};

export default function ExecutiveHubWidget({ liveData }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "overview";
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
          <LayoutDashboard className="h-6 w-6 text-[color:var(--brand-accent)]" />
          {t("workspaceWidgets.titles.executiveHub")}
        </h1>
      </div>
      <WidgetHubShell
        tabs={TABS}
        initialTab={activeTab}
        onTabChange={handleTabChange}
        tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
        renderTab={(tabId) =>
          tabId === "progressBills" ? <ProgressBillPortalPanel /> : <ExecutiveDashboardWidget />
        }
      />
    </div>
  );
}
