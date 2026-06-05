"use client";

import React from "react";
import dynamic from "next/dynamic";
import ProjectWidget from "@/components/os/ProjectWidget";
import CashflowWidget from "@/components/os/widgets/CashflowWidget";
import AiChatWidget from "@/components/os/AiChatWidget";
import CrmWidget from "@/components/os/CrmWidget";
import DashboardWidget from "@/components/os/DashboardWidget";
import ErpDocumentsWidget from "@/components/os/widgets/ErpDocumentsWidget";
import ProjectBoardWidget from "@/components/os/widgets/ProjectBoardWidget";
import CrmTableWidget, { type OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import ErpFileArchiveWidget from "@/components/os/widgets/ErpFileArchiveWidget";
import AiChatFullWidget from "@/components/os/widgets/AiChatFullWidget";
import SettingsWidget from "@/components/os/widgets/SettingsWidget";
import MeckanoHubWidget from "@/components/os/widgets/MeckanoHubWidget";
import GoogleDriveWidget from "@/components/os/widgets/GoogleDriveWidget";
import GoogleCalendarWidget from "@/components/os/widgets/GoogleCalendarWidget";
import AccessibilityWidget from "@/components/os/widgets/AccessibilityWidget";
import FinanceHubWidget from "@/components/os/hubs/FinanceHubWidget";
import ProjectsHubWidget from "@/components/os/hubs/ProjectsHubWidget";
import DocumentsHubWidget from "@/components/os/hubs/DocumentsHubWidget";
import AiHubWidget from "@/components/os/hubs/AiHubWidget";
import WidgetState from "@/components/os/WidgetState";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { useI18n } from "@/components/os/system/I18nProvider";

function WidgetLoadingPlaceholder() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  );
}

const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const DocumentCreatorWidget = dynamic(() => import("@/components/os/widgets/DocumentCreatorWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const FieldCopilotWidget = dynamic(() => import("@/components/os/widgets/FieldCopilotWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const AppBuilderWidget = dynamic(() => import("@/components/os/widgets/AppBuilderWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const PlatformAdminWidget = dynamic(() => import("@/components/os/widgets/PlatformAdminWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const HelpCenterWidget = dynamic(() => import("@/components/os/widgets/HelpCenterWidget"), { loading: () => <WidgetLoadingPlaceholder /> });
const JewishCalendarWidget = dynamic(() => import("@/components/os/widgets/JewishCalendarWidget"), { loading: () => <WidgetLoadingPlaceholder /> });

export const RENDERED_WIDGET_TYPES = new Set<WidgetType>([
  "project", "crm", "dashboard", "aiChat", "cashflow", "erp", "projectBoard", "crmTable",
  "erpArchive", "docCreator", "aiScanner", "fieldCopilot", "aiChatFull", "settings",
  "meckanoReports", "googleDrive", "googleCalendar", "jewishCalendar", "notebookLM", "accessibility",
  "platformAdmin", "helpCenter", "financeHub", "projectsHub", "documentsHub", "aiHub", "appBuilder",
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
  if (widget.type === "financeHub") return <FinanceHubWidget liveData={widget.liveData} />;
  if (widget.type === "projectsHub") return <ProjectsHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "documentsHub") return <DocumentsHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;
  if (widget.type === "aiHub") return <AiHubWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />;

  return (
    <WidgetState variant="error"
      message={t("workspaceWidgets.unsupportedWidget", { type: widget.type })}
      onRetry={() => openWorkspaceWidget(widget.type, widget.liveData)}
      retryLabel={t("workspaceWidgets.retry")}
    />
  );
}
