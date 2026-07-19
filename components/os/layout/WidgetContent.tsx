"use client";

import React from "react";
import dynamic from "next/dynamic";
import WidgetState from "@/components/os/WidgetState";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import { resolveWidgetOpen } from "@/lib/os-assistant/resolve-widget-open";

function WidgetLoadingPlaceholder() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  );
}

const loading = () => <WidgetLoadingPlaceholder />;

const CashflowWidget = dynamic(() => import("@/components/os/widgets/CashflowWidget"), { loading });
const AiChatWidget = dynamic(() => import("@/components/os/AiChatWidget"), { loading });
const CrmWidget = dynamic(() => import("@/components/os/CrmWidget"), { loading });
const DashboardWidget = dynamic(() => import("@/components/os/DashboardWidget"), { loading });
const ErpDocumentsWidget = dynamic(() => import("@/components/os/widgets/ErpDocumentsWidget"), { loading });
const ProjectBoardWidget = dynamic(() => import("@/components/os/widgets/ProjectBoardWidget"), { loading });
const CrmTableWidget = dynamic(() => import("@/components/os/widgets/CrmTableWidget"), { loading });
const ErpFileArchiveWidget = dynamic(() => import("@/components/os/widgets/ErpFileArchiveWidget"), { loading });
const AiChatFullWidget = dynamic(() => import("@/components/os/widgets/AiChatFullWidget"), { loading });
const SettingsWidget = dynamic(() => import("@/components/os/widgets/SettingsWidget"), { loading });
const MeckanoHubWidget = dynamic(() => import("@/components/os/widgets/MeckanoHubWidget"), { loading });
const GoogleDriveWidget = dynamic(() => import("@/components/os/widgets/GoogleDriveWidget"), { loading });
const GoogleCalendarWidget = dynamic(() => import("@/components/os/widgets/GoogleCalendarWidget"), { loading });
const AccessibilityWidget = dynamic(() => import("@/components/os/widgets/AccessibilityWidget"), { loading });
const FinanceHubWidget = dynamic(() => import("@/components/os/hubs/FinanceHubWidget"), { loading });
const ProjectsHubWidget = dynamic(() => import("@/components/os/hubs/ProjectsHubWidget"), { loading });
const DocumentsHubWidget = dynamic(() => import("@/components/os/hubs/DocumentsHubWidget"), { loading });
const AiHubWidget = dynamic(() => import("@/components/os/hubs/AiHubWidget"), { loading });
const LogisticsHubWidget = dynamic(() => import("@/components/os/hubs/LogisticsHubWidget"), { loading });
const ProcurementHubWidget = dynamic(() => import("@/components/os/hubs/ProcurementHubWidget"), { loading });
const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), { loading });
const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), { loading });
const DocumentCreatorWidget = dynamic(() => import("@/components/os/widgets/DocumentCreatorWidget"), { loading });
const FieldCopilotWidget = dynamic(() => import("@/components/os/widgets/FieldCopilotWidget"), { loading });
const AppBuilderWidget = dynamic(() => import("@/components/os/widgets/AppBuilderWidget"), { loading });
const PlatformAdminWidget = dynamic(() => import("@/components/os/widgets/PlatformAdminWidget"), { loading });
const HelpCenterWidget = dynamic(() => import("@/components/os/widgets/HelpCenterWidget"), { loading });
const ExecutiveHubWidget = dynamic(() => import("@/components/os/hubs/ExecutiveHubWidget"), { loading });
const JewishCalendarWidget = dynamic(() => import("@/components/os/widgets/JewishCalendarWidget"), { loading });
const UniversalCommandWidget = dynamic(() => import("@/components/os/widgets/UniversalCommandWidget"), { loading });

export const RENDERED_WIDGET_TYPES = new Set<WidgetType>([
  "project", "crm", "dashboard", "aiChat", "cashflow", "erp", "projectBoard", "crmTable",
  "erpArchive", "docCreator", "aiScanner", "fieldCopilot", "aiChatFull", "settings",
  "meckanoReports", "googleDrive", "googleCalendar", "jewishCalendar", "notebookLM", "accessibility",
  "platformAdmin", "helpCenter",   "financeHub", "projectsHub", "documentsHub", "aiHub", "appBuilder",
  "logisticsHub", "procurementHub", "executiveHub", "universalCommand",
]);

export function WidgetContent({
  widget, openWorkspaceWidget,
}: {
  widget: ActiveWidget;
  openWorkspaceWidget: OpenWorkspaceWidgetFn;
}) {
  const { t } = useI18n();

  // Consolidated legacy types render as their Hub (same mapping as launcher/scrub).
  const resolved = resolveWidgetOpen(widget.type, widget.liveData) ?? {
    type: widget.type,
    liveData: widget.liveData,
  };
  const type = resolved.type;
  const liveData = resolved.liveData;

  if (type === "crm") return <CrmWidget />;
  if (type === "dashboard") return <DashboardWidget />;
  if (type === "aiChat") {
    return (
      <AiChatWidget
        provider={String(liveData?.provider || "gemini")}
        prompt={String(liveData?.prompt || "")}
      />
    );
  }
  if (type === "cashflow") return <CashflowWidget />;
  if (type === "erp") return <ErpDocumentsWidget />;
  if (type === "projectBoard") {
    return (
      <ProjectBoardWidget
        projectId={typeof liveData?.projectId === "string" ? liveData.projectId : undefined}
        openWorkspaceWidget={openWorkspaceWidget}
      />
    );
  }
  if (type === "crmTable") return <CrmTableWidget openWorkspaceWidget={openWorkspaceWidget} />;
  if (type === "erpArchive") return <ErpFileArchiveWidget />;
  if (type === "docCreator") return <DocumentCreatorWidget liveData={liveData} />;
  if (type === "aiScanner") {
    return <AiScannerWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "fieldCopilot") {
    return <FieldCopilotWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "appBuilder") return <AppBuilderWidget />;
  if (type === "aiChatFull") {
    return <AiChatFullWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "settings") return <SettingsWidget />;
  if (type === "meckanoReports") return <MeckanoHubWidget />;
  if (type === "googleDrive") {
    return <GoogleDriveWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "googleCalendar") {
    return <GoogleCalendarWidget openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "jewishCalendar") return <JewishCalendarWidget />;
  if (type === "notebookLM") {
    return <NotebookLMWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "accessibility") return <AccessibilityWidget />;
  if (type === "platformAdmin") return <PlatformAdminWidget />;
  if (type === "helpCenter") return <HelpCenterWidget openWorkspaceWidget={openWorkspaceWidget} />;
  if (type === "financeHub") {
    return <FinanceHubWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "projectsHub") {
    return <ProjectsHubWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "documentsHub") {
    return <DocumentsHubWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "aiHub") {
    return <AiHubWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "logisticsHub") return <LogisticsHubWidget liveData={liveData} />;
  if (type === "procurementHub") {
    return <ProcurementHubWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (type === "executiveHub") return <ExecutiveHubWidget liveData={liveData} />;
  if (type === "universalCommand") {
    return <UniversalCommandWidget liveData={liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }

  return (
    <WidgetState variant="error"
      message={t("workspaceWidgets.unsupportedWidget", { type: widget.type })}
      onRetry={() => openWorkspaceWidget(widget.type, widget.liveData)}
      retryLabel={t("workspaceWidgets.retry")}
    />
  );
}
