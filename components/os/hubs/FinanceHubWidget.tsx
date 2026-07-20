"use client";

import { useCallback, useEffect, useState } from "react";
import DashboardWidget from "@/components/os/DashboardWidget";
import CashflowWidget from "@/components/os/widgets/CashflowWidget";
import OfficeExpensesHubLink from "@/components/os/widgets/OfficeExpensesHubLink";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import type { WidgetType } from "@/hooks/use-window-manager";

const TABS: HubTabDef[] = [
  { id: "overview", labelKey: "workspaceWidgets.hubs.finance.tabs.overview" },
  { id: "cashflow", labelKey: "workspaceWidgets.hubs.finance.tabs.cashflow" },
];

type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
) => void;

type Props = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function FinanceHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "overview";
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (liveData?.tab !== "officeExpenses" || !openWorkspaceWidget) return;
    openWorkspaceWidget("executiveHub", { tab: "officeExpenses" });
  }, [liveData?.tab, openWorkspaceWidget]);

  const applyView = useCallback((view: WidgetViewState) => {
    const tab = view.tab;
    if (tab === "officeExpenses") return;
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
    <WidgetHubShell
      tabs={TABS}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
      renderTab={(tabId) => {
        if (tabId === "cashflow") {
          return (
            <CashflowWidget
              openWorkspaceWidget={openWorkspaceWidget}
              onOpenOverview={() => handleTabChange("overview")}
            />
          );
        }
        return (
          <div className="flex min-h-0 flex-1 flex-col">
            {openWorkspaceWidget ? (
              <div className="shrink-0 px-3 pt-3 md:px-4">
                <OfficeExpensesHubLink
                  openWorkspaceWidget={openWorkspaceWidget}
                  variant="finance"
                />
              </div>
            ) : null}
            <DashboardWidget
              openWorkspaceWidget={openWorkspaceWidget}
              onOpenCashflow={() => handleTabChange("cashflow")}
            />
          </div>
        );
      }}
    />
  );
}
