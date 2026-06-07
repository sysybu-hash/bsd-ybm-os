"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import ErpFileArchiveWidget from "@/components/os/widgets/ErpFileArchiveWidget";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import WidgetState from "@/components/os/WidgetState";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const DocumentCreatorWidget = dynamic(() => import("@/components/os/widgets/DocumentCreatorWidget"), {
  loading: () => <WidgetState variant="loading" message="" />,
});
const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), {
  loading: () => <WidgetState variant="loading" message="" />,
});

const TABS: HubTabDef[] = [
  { id: "archive", labelKey: "workspaceWidgets.hubs.documents.tabs.archive" },
  { id: "create", labelKey: "workspaceWidgets.hubs.documents.tabs.create" },
  { id: "scan", labelKey: "workspaceWidgets.hubs.documents.tabs.scan" },
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

export default function DocumentsHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "archive";
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
        if (tabId === "create") {
          return <DocumentCreatorWidget liveData={liveData} embeddedInHub />;
        }
        if (tabId === "scan") {
          return (
            <AiScannerWidget liveData={liveData} embeddedInHub openWorkspaceWidget={openWorkspaceWidget} />
          );
        }
        return <ErpFileArchiveWidget />;
      }}
    />
  );
}
