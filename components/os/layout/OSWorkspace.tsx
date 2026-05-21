"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import SortableLauncherZone from "@/components/os/launcher/SortableLauncherZone";
import { useSession } from "next-auth/react";
import WidgetInstance from "@/components/os/navigation/WidgetInstance";
import type { WidgetViewState } from "@/lib/workspace-navigation/types";
import ProjectWidget from "@/components/os/ProjectWidget";
import CashflowWidget from "@/components/os/widgets/CashflowWidget";
import AiChatWidget from "@/components/os/AiChatWidget";
import CrmWidget from "@/components/os/CrmWidget";
import DashboardWidget from "@/components/os/DashboardWidget";
import ErpDocumentsWidget from "@/components/os/widgets/ErpDocumentsWidget";
import ProjectBoardWidget from "@/components/os/widgets/ProjectBoardWidget";
import CrmTableWidget, { type OpenWorkspaceWidgetFn } from "@/components/os/widgets/CrmTableWidget";
import ErpFileArchiveWidget from "@/components/os/widgets/ErpFileArchiveWidget";
import dynamic from "next/dynamic";
import AiChatFullWidget from "@/components/os/widgets/AiChatFullWidget";
import SettingsWidget from "@/components/os/widgets/SettingsWidget";
import MeckanoReportsWidget from "@/components/os/widgets/MeckanoReportsWidget";
import GoogleDriveWidget from "@/components/os/widgets/GoogleDriveWidget";
import AccessibilityWidget from "@/components/os/widgets/AccessibilityWidget";
import { useI18n } from "@/components/os/system/I18nProvider";
import { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { registerWorkspaceBoundsRef } from "@/lib/workspace/workspace-bounds-registry";
const AiScannerWidget = dynamic(() => import("@/components/os/widgets/AiScannerWidget"), {
  loading: () => <WidgetLoadingPlaceholder />,
});
const NotebookLMWidget = dynamic(() => import("@/components/os/widgets/NotebookLMWidget"), {
  loading: () => <WidgetLoadingPlaceholder />,
});
const DocumentCreatorWidget = dynamic(
  () => import("@/components/os/widgets/DocumentCreatorWidget"),
  { loading: () => <WidgetLoadingPlaceholder /> },
);
const PlatformAdminWidget = dynamic(() => import("@/components/os/widgets/PlatformAdminWidget"), {
  loading: () => <WidgetLoadingPlaceholder />,
});
const HelpCenterWidget = dynamic(() => import("@/components/os/widgets/HelpCenterWidget"), {
  loading: () => <WidgetLoadingPlaceholder />,
});

function WidgetLoadingPlaceholder() {
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center text-xs text-[color:var(--foreground-muted)]">
      …
    </div>
  );
}

interface OSWorkspaceProps {
  widgets: ActiveWidget[];
  hasHydrated: boolean;
  openWidget: (type: WidgetType, data?: Record<string, unknown> | null) => string;
  openWorkspaceWidget: OpenWorkspaceWidgetFn;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
  updateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  toggleMaximize: (id: string) => void;
  updateZoom: (id: string, delta: number) => void;
  onWidgetViewChange?: (widgetId: string, widgetType: WidgetType, state: WidgetViewState | null) => void;
}

export default function OSWorkspace({
  widgets,
  hasHydrated,
  openWidget,
  openWorkspaceWidget,
  closeWidget,
  focusWidget,
  updateWidgetPosition,
  updateWidgetSize,
  toggleMaximize,
  updateZoom,
  onWidgetViewChange,
}: OSWorkspaceProps) {
  const { t, dir } = useI18n();
  const { data: session } = useSession();
  const workspaceBoundsRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    registerWorkspaceBoundsRef(workspaceBoundsRef);
    return () => registerWorkspaceBoundsRef(null);
  }, []);
  const [greetingKey, setGreetingKey] = React.useState("workspaceWidgets.empty.greetingMorning");
  const userName = session?.user?.name?.split(" ")[0] || t("workspaceWidgets.empty.guestUser");

  const widgetTitle = (type: WidgetType) => t(`workspaceWidgets.titles.${type}`);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || widgets.length === 0) return;
      const topWidget = [...widgets].sort((a, b) => {
        if (a.isMaximized && !b.isMaximized) return -1;
        if (!a.isMaximized && b.isMaximized) return 1;
        return b.zIndex - a.zIndex;
      })[0];
      if (topWidget?.isMaximized) {
        toggleMaximize(topWidget.id);
        return;
      }
      if (topWidget) closeWidget(topWidget.id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [widgets, closeWidget, toggleMaximize]);

  React.useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 5) setGreetingKey("workspaceWidgets.empty.greetingNight");
    else if (hour < 12) setGreetingKey("workspaceWidgets.empty.greetingMorning");
    else if (hour < 18) setGreetingKey("workspaceWidgets.empty.greetingNoon");
    else setGreetingKey("workspaceWidgets.empty.greetingEvening");
  }, []);

  const omnibarName = t("workspaceWidgets.empty.omnibarName");
  const topZ = widgets.length > 0 ? Math.max(...widgets.map((w) => w.zIndex)) : 0;

  return (
    <div ref={workspaceBoundsRef} className="relative flex h-full min-h-0 flex-1 overflow-hidden" dir={dir}>
      <AnimatePresence mode="wait">
        {hasHydrated && widgets.length === 0 && (
          <motion.section
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 z-10 flex min-h-0 flex-col items-center overflow-hidden p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 md:p-6 md:pb-8"
          >
            <header className="flex w-full max-w-4xl shrink-0 flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm md:mb-4 md:h-16 md:w-16">
                <Bot size={28} className="text-indigo-400" aria-hidden />
              </div>

              <h1 className="mb-1.5 px-4 text-2xl font-black tracking-normal text-[color:var(--foreground-main)] sm:text-3xl md:mb-2 md:text-6xl">
                {t(greetingKey)},{" "}
                <span className="bg-gradient-to-l from-emerald-400 to-indigo-400 bg-clip-text text-transparent">{userName}</span>
              </h1>

              <p className="mx-auto max-w-xl px-4 text-sm font-semibold leading-6 text-pretty text-[color:var(--foreground-muted)] md:text-lg md:leading-7">
                {t("workspaceWidgets.empty.subtitle", { omnibar: omnibarName })}
              </p>
            </header>

            <div className="flex w-full min-h-0 flex-1 flex-col items-center justify-center">
              <SortableLauncherZone
                zone="quickGrid"
                variant="quick"
                onOpen={openWidget}
                className="w-full shrink-0"
              />
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div
        className={`pointer-events-none absolute inset-0 ${widgets.length > 0 ? "z-[800]" : "z-20"}`}
      >
        {widgets.map((widget) => (
          <WidgetInstance
            key={widget.id}
            widget={widget}
            title={widgetTitle(widget.type)}
            topZ={topZ}
            isFocused={widget.zIndex === topZ}
            onClose={() => closeWidget(widget.id)}
            onFocus={() => focusWidget(widget.id)}
            onPositionChange={(pos) => updateWidgetPosition(widget.id, pos)}
            onResize={(s) => updateWidgetSize(widget.id, s)}
            onMaximize={() => toggleMaximize(widget.id)}
            onZoomChange={(delta) => updateZoom(widget.id, delta)}
            onRequestFocusWidget={focusWidget}
            onViewChange={onWidgetViewChange}
            workspaceBoundsRef={workspaceBoundsRef}
          >
            {widget.type === "project" && (
              <ProjectWidget
                projectId={
                  typeof widget.liveData?.projectId === "string" ? widget.liveData.projectId : undefined
                }
                projectName={typeof widget.liveData?.name === "string" ? widget.liveData.name : undefined}
                openWorkspaceWidget={openWorkspaceWidget}
              />
            )}
            {widget.type === "crm" && <CrmWidget />}
            {widget.type === "dashboard" && <DashboardWidget />}
            {widget.type === "aiChat" && (
              <AiChatWidget
                provider={String(widget.liveData?.provider || "gemini")}
                prompt={String(widget.liveData?.prompt || "")}
              />
            )}
            {widget.type === "cashflow" && <CashflowWidget data={widget.liveData} />}
            {widget.type === "erp" && <ErpDocumentsWidget />}
            {widget.type === "projectBoard" && (
              <ProjectBoardWidget
                projectId={
                  typeof widget.liveData?.projectId === "string" ? widget.liveData.projectId : undefined
                }
                openWorkspaceWidget={openWorkspaceWidget}
              />
            )}
            {widget.type === "crmTable" && <CrmTableWidget openWorkspaceWidget={openWorkspaceWidget} />}
            {widget.type === "erpArchive" && <ErpFileArchiveWidget />}
            {widget.type === "docCreator" && <DocumentCreatorWidget liveData={widget.liveData} />}
            {widget.type === "aiScanner" && (
              <AiScannerWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />
            )}
            {widget.type === "aiChatFull" && (
              <AiChatFullWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />
            )}
            {widget.type === "settings" && <SettingsWidget />}
            {widget.type === "meckanoReports" && <MeckanoReportsWidget />}
            {widget.type === "googleDrive" && (
              <GoogleDriveWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />
            )}
            {widget.type === "notebookLM" && (
              <NotebookLMWidget liveData={widget.liveData} openWorkspaceWidget={openWorkspaceWidget} />
            )}
            {widget.type === "accessibility" && <AccessibilityWidget />}
            {widget.type === "platformAdmin" && <PlatformAdminWidget />}
            {widget.type === "helpCenter" && (
              <HelpCenterWidget openWorkspaceWidget={openWorkspaceWidget} />
            )}
          </WidgetInstance>
        ))}
      </div>
    </div>
  );
}
