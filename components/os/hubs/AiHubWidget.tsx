"use client";

import { useCallback, useState } from "react";
import AiChatFullWidget from "@/components/os/widgets/AiChatFullWidget";
import AppBuilderWidget from "@/components/os/widgets/AppBuilderWidget";
import NotebookLMWidget from "@/components/os/widgets/NotebookLMWidget";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const TABS: HubTabDef[] = [
  { id: "chat", labelKey: "workspaceWidgets.hubs.ai.tabs.chat" },
  { id: "notebook", labelKey: "workspaceWidgets.hubs.ai.tabs.notebook" },
  { id: "builder", labelKey: "workspaceWidgets.hubs.ai.tabs.builder" },
];

type OpenWorkspaceWidgetFn = (
  type: WidgetType,
  data?: Record<string, unknown> | null,
  options?: { maximize?: boolean },
) => void;

type Props = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function AiHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "chat";
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
      renderTab={(tabId) =>
        tabId === "notebook" ? (
          <NotebookLMWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />
        ) : tabId === "builder" ? (
          <AppBuilderWidget />
        ) : (
          <AiChatFullWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />
        )
      }
    />
  );
}
