"use client";

import { useCallback, useState } from "react";
import DashboardWidget from "@/components/os/DashboardWidget";
import CashflowWidget from "@/components/os/widgets/CashflowWidget";
import OfficeExpensesWidget from "@/components/os/widgets/OfficeExpensesWidget";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const TABS: HubTabDef[] = [
  { id: "overview", labelKey: "workspaceWidgets.hubs.finance.tabs.overview" },
  { id: "cashflow", labelKey: "workspaceWidgets.hubs.finance.tabs.cashflow" },
  { id: "officeExpenses", labelKey: "workspaceWidgets.hubs.finance.tabs.officeExpenses" },
];

type Props = {
  liveData?: Record<string, unknown> | null;
};

export default function FinanceHubWidget({ liveData }: Props) {
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
    <WidgetHubShell
      tabs={TABS}
      initialTab={activeTab}
      onTabChange={handleTabChange}
      tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
      renderTab={(tabId) => {
        if (tabId === "cashflow") return <CashflowWidget />;
        if (tabId === "officeExpenses") return <OfficeExpensesWidget />;
        return <DashboardWidget />;
      }}
    />
  );
}
