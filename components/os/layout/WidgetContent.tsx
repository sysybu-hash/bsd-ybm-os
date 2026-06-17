"use client";

import React from "react";
import dynamic from "next/dynamic";
import WidgetState from "@/components/os/WidgetState";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";

function WidgetLoadingPlaceholder() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  );
}

const loading = () => <WidgetLoadingPlaceholder />;

const ProjectWidget = dynamic(() => import("@/components/os/ProjectWidget"), { loading });
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

export const RENDERED_WIDGET_TYPES = new Set<WidgetType>([
  "project", "crm", "dashboard", "aiChat", "cashflow", "erp", "projectBoard", "crmTable",
  "erpArchive", "docCreator", "aiScanner", "fieldCopilot", "aiChatFull", "settings",
  "meckanoReports", "googleDrive", "googleCalendar", "jewishCalendar", "notebookLM", "accessibility",
  "platformAdmin", "helpCenter",   "financeHub", "projectsHub", "documentsHub", "aiHub", "appBuilder",
  "logisticsHub", "procurementHub", "executiveHub",
]);

export function WidgetContent({
  widget, openWorkspaceWidget,
}: {
  widget: ActiveWidget;
  openWorkspaceWidget: OpenWorkspaceWidgetFn;
}) {
  const { t } = useI18n();

  if (widget.type === "project") return <ProjectWidget projectId={typeof widget.liveData?.projectId === "string" ? widget.liveData.projectId : undefined} projectName={typeof widget.liveData?.name === "string" ? widget.liveData.name : undefined} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "crm") return <CrmWidget />;
  if (widget.type === "dashboard") return <DashboardWidget />;
  if (widget.type === "aiChat") return <AiChatWidget provider={String(widget.liveData?.provider || "gemini")} prompt={String(widget.liveData?.prompt || "")} />;
  if (widget.type === "cashflow") return <CashflowWidget />;
  if (widget.type === "erp") return <ErpDocumentsWidget />;
  if (widget.type === "projectBoard") return <ProjectBoardWidget projectId={typeof widget.liveData?.projectId === "string" ? widget.liveData.projectId : undefined} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "crmTable") return <CrmTableWidget openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "erpArchive") return <ErpFileArchiveWidget />;
  if (widget.type === "docCreator") return <DocumentCreatorWidget liveData={widget.liveData} />;
  if (widget.type === "aiScanner") return <AiScannerWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "fieldCopilot") return <FieldCopilotWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "appBuilder") return <AppBuilderWidget />;
  if (widget.type === "aiChatFull") return <AiChatFullWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "settings") return <SettingsWidget />;
  if (widget.type === "meckanoReports") return <MeckanoHubWidget />;
  if (widget.type === "googleDrive") return <GoogleDriveWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "googleCalendar") return <GoogleCalendarWidget openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "jewishCalendar") return <JewishCalendarWidget />;
  if (widget.type === "notebookLM") return <NotebookLMWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "accessibility") return <AccessibilityWidget />;
  if (widget.type === "platformAdmin") return <PlatformAdminWidget />;
  if (widget.type === "helpCenter") return <HelpCenterWidget openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "financeHub") return <FinanceHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "projectsHub") return <ProjectsHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "documentsHub") return <DocumentsHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "aiHub") return <AiHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "logisticsHub") return <LogisticsHubWidget liveData={widget.liveData} />;
  if (widget.type === "procurementHub") {
    return <ProcurementHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  }
  if (widget.type === "executiveHub") return <ExecutiveHubWidget liveData={widget.liveData} />;

  return (
    <WidgetState variant="error"
      message={t("workspaceWidgets.unsupportedWidget", { type: widget.type })}
      onRetry={() => openWorkspaceWidget(widget.type, widget.liveData)}
      retryLabel={t("workspaceWidgets.retry")}
    />
  );
}
