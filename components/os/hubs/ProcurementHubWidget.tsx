"use client";

import { useCallback, useState } from "react";
import { ShoppingCart } from "lucide-react";
import WidgetHubShell, { type HubTabDef } from "@/components/os/hubs/WidgetHubShell";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import CreatePoPanel from "@/components/os/widgets/procurement/CreatePoPanel";
import CreateRequestPanel from "@/components/os/widgets/procurement/CreateRequestPanel";
import ProcurementOrdersTab from "@/components/os/widgets/procurement/ProcurementOrdersTab";
import ProcurementRequestsTab from "@/components/os/widgets/procurement/ProcurementRequestsTab";
import ProcurementSuppliersTab from "@/components/os/widgets/procurement/ProcurementSuppliersTab";
import ReceivePoPanel from "@/components/os/widgets/procurement/ReceivePoPanel";
import { useSyncedWidgetNavigation } from "@/hooks/use-synced-widget-navigation";
import type { ProcurementRequestRow, PurchaseOrderRow } from "@/lib/validation/schemas/procurement";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";

const TABS: HubTabDef[] = [
  { id: "requests", labelKey: "workspaceWidgets.hubs.procurement.tabs.requests" },
  { id: "orders", labelKey: "workspaceWidgets.hubs.procurement.tabs.orders" },
  { id: "suppliers", labelKey: "workspaceWidgets.hubs.procurement.tabs.suppliers" },
];

type Props = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

export default function ProcurementHubWidget({ liveData, openWorkspaceWidget }: Props) {
  const { t } = useI18n();
  const initialTab =
    typeof liveData?.tab === "string" && TABS.some((tab) => tab.id === liveData.tab)
      ? (liveData.tab as string)
      : "requests";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [poRequest, setPoRequest] = useState<ProcurementRequestRow | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrderRow | null>(null);
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [ordersRefreshKey, setOrdersRefreshKey] = useState(0);
  const [requestsRefreshKey, setRequestsRefreshKey] = useState(0);

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

  const handlePoCreated = useCallback(() => {
    setPoRequest(null);
    setOrdersRefreshKey((key) => key + 1);
    setActiveTab("orders");
    pushView({ tab: "orders" });
  }, [pushView]);

  const handleRequestCreated = useCallback(() => {
    setShowNewRequest(false);
    setRequestsRefreshKey((key) => key + 1);
  }, []);

  const handleReceived = useCallback(() => {
    setReceiveOrder(null);
    setOrdersRefreshKey((key) => key + 1);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[color:var(--background-main)]">
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-4 py-4 md:px-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-[color:var(--foreground-main)] md:text-2xl">
          <ShoppingCart className="h-6 w-6 text-[color:var(--brand-accent)]" />
          {t("workspaceWidgets.titles.procurementHub")}
        </h1>
        <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.procurement.subtitle")}
        </p>
      </div>
      <WidgetHubShell
        tabs={TABS}
        initialTab={activeTab}
        onTabChange={handleTabChange}
        tabCountLabel={t("workspaceWidgets.hubs.tabCount", { count: String(TABS.length) })}
        renderTab={(tabId) => {
          if (tabId === "requests") {
            return (
              <ProcurementRequestsTab
                key={requestsRefreshKey}
                onCreatePo={setPoRequest}
                onNewRequest={() => setShowNewRequest(true)}
              />
            );
          }
          if (tabId === "orders") {
            return (
              <ProcurementOrdersTab
                key={ordersRefreshKey}
                enabled={activeTab === "orders"}
                onReceive={setReceiveOrder}
                openWorkspaceWidget={openWorkspaceWidget}
              />
            );
          }
          return <ProcurementSuppliersTab enabled={activeTab === "suppliers"} />;
        }}
      />
      <CreatePoPanel
        request={poRequest}
        open={poRequest !== null}
        onClose={() => setPoRequest(null)}
        onCreated={handlePoCreated}
      />
      <CreateRequestPanel
        open={showNewRequest}
        onClose={() => setShowNewRequest(false)}
        onCreated={handleRequestCreated}
      />
      <ReceivePoPanel
        order={receiveOrder}
        open={receiveOrder !== null}
        onClose={() => setReceiveOrder(null)}
        onReceived={handleReceived}
      />
    </div>
  );
}
