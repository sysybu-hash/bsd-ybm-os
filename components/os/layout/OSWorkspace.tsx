"use client";

import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BarChart3, Bot, FilePlus, HardDrive, Library, Package, ScanLine, Sparkles, Users } from "lucide-react";
import { useSession } from "next-auth/react";
import AdaptiveWidgetShell from "@/components/os/AdaptiveWidgetShell";
import ProjectWidget from "@/components/os/ProjectWidget";
import CashflowWidget from "@/components/os/widgets/CashflowWidget";
import AiChatWidget from "@/components/os/AiChatWidget";
import CrmWidget from "@/components/os/CrmWidget";
import DashboardWidget from "@/components/os/DashboardWidget";
import ErpDocumentsWidget from "@/components/os/widgets/ErpDocumentsWidget";
import ProjectBoardWidget from "@/components/os/widgets/ProjectBoardWidget";
import CrmTableWidget from "@/components/os/widgets/CrmTableWidget";
import ErpFileArchiveWidget from "@/components/os/widgets/ErpFileArchiveWidget";
import DocumentCreatorWidget from "@/components/os/widgets/DocumentCreatorWidget";
import AiScannerWidget from "@/components/os/widgets/AiScannerWidget";
import AiChatFullWidget from "@/components/os/widgets/AiChatFullWidget";
import SettingsWidget from "@/components/os/widgets/SettingsWidget";
import MeckanoReportsWidget from "@/components/os/widgets/MeckanoReportsWidget";
import GoogleDriveWidget from "@/components/os/widgets/GoogleDriveWidget";
import GoogleAssistantWidget from "@/components/os/widgets/GoogleAssistantWidget";
import NotebookLMWidget from "@/components/os/widgets/NotebookLMWidget";
import { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";

interface OSWorkspaceProps {
  widgets: ActiveWidget[];
  hasHydrated: boolean;
  openWidget: (type: WidgetType) => void;
  closeWidget: (id: string) => void;
  focusWidget: (id: string) => void;
  updateWidgetPosition: (id: string, pos: { x: number; y: number }) => void;
  updateWidgetSize: (id: string, size: { width: number; height: number }) => void;
  toggleMaximize: (id: string) => void;
  updateZoom: (id: string, delta: number) => void;
}

const widgetTitles: Record<WidgetType, string> = {
  project: "פרויקט",
  cashflow: "תזרים מזומנים",
  aiChat: "עוזר AI",
  crm: "ניהול לקוחות CRM",
  dashboard: "דאשבורד פיננסי",
  erp: "ארכיון ERP ופריטים",
  docCreator: "יוצר מסמכים",
  aiScanner: "סורק חשבוניות AI",
  projectBoard: "לוח פרויקטים",
  crmTable: "טבלת לקוחות",
  erpArchive: "ארכיון קבצי ERP",
  aiChatFull: "צ׳אט AI מלא",
  settings: "הגדרות מערכת",
  meckanoReports: "מחולל דוחות Meckano",
  quoteGen: "מחולל הצעות מחיר",
  googleDrive: "Google Drive",
  googleAssistant: "Google Assistant",
  notebookLM: "NotebookLM",
};

const quickActions = [
  { type: "projectBoard" as WidgetType, icon: BarChart3, title: "לוח פרויקטים", subtitle: "ניהול משימות" },
  { type: "crmTable" as WidgetType, icon: Users, title: "ניהול לקוחות", subtitle: "מאגר CRM" },
  { type: "erpArchive" as WidgetType, icon: Package, title: "ארכיון ERP", subtitle: "ניהול קבצים" },
  { type: "docCreator" as WidgetType, icon: FilePlus, title: "הפקת מסמכים", subtitle: "הצעות וחשבוניות" },
  { type: "aiScanner" as WidgetType, icon: ScanLine, title: "סריקת AI", subtitle: "פענוח מסמכים" },
  { type: "aiChatFull" as WidgetType, icon: Sparkles, title: "צ׳אט AI", subtitle: "עוזר אישי" },
  { type: "googleDrive" as WidgetType, icon: HardDrive, title: "Google Drive", subtitle: "קבצים בענן" },
  { type: "notebookLM" as WidgetType, icon: Library, title: "NotebookLM", subtitle: "מחברת AI" },
];

export default function OSWorkspace({
  widgets,
  hasHydrated,
  openWidget,
  closeWidget,
  focusWidget,
  updateWidgetPosition,
  updateWidgetSize,
  toggleMaximize,
  updateZoom,
}: OSWorkspaceProps) {
  const { data: session } = useSession();
  const workspaceBoundsRef = React.useRef<HTMLDivElement>(null);
  const [greeting, setGreeting] = React.useState("שלום");
  const userName = session?.user?.name?.split(" ")[0] || "משתמש";

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || widgets.length === 0) return;
      const topWidget = [...widgets].sort((a, b) => {
        if (a.isMaximized && !b.isMaximized) return -1;
        if (!a.isMaximized && b.isMaximized) return 1;
        return b.zIndex - a.zIndex;
      })[0];
      if (topWidget) closeWidget(topWidget.id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [widgets, closeWidget]);

  React.useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 5) setGreeting("לילה טוב");
    else if (hour < 12) setGreeting("בוקר טוב");
    else if (hour < 18) setGreeting("צהריים טובים");
    else setGreeting("ערב טוב");
  }, []);

  return (
    <div ref={workspaceBoundsRef} className="relative flex min-h-0 flex-1 overflow-hidden">
      <AnimatePresence mode="wait">
        {hasHydrated && widgets.length === 0 && (
          <motion.section
            key="empty-state"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98 }}
            className="absolute inset-0 flex flex-col items-center justify-center p-6"
          >
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-sm">
              <Bot size={28} className="text-indigo-400" aria-hidden />
            </div>

            <h1 className="mb-3 px-4 text-center text-4xl font-black tracking-normal text-[color:var(--foreground-main)] md:text-6xl">
              {greeting},{" "}
              <span className="bg-gradient-to-l from-emerald-400 to-indigo-400 bg-clip-text text-transparent">{userName}</span>
            </h1>

            <p className="mx-auto mb-8 max-w-xl px-4 text-center text-base font-semibold leading-7 text-pretty text-[color:var(--foreground-muted)] md:text-lg">
              BSD-YBM OS מוכנה לעבודה. בחר פעולה מהירה או הקלד פקודה ב־
              <span className="whitespace-nowrap">Omnibar</span>.
            </p>

            <div className="grid w-full max-w-4xl grid-cols-2 gap-3 px-2 md:grid-cols-4 md:px-0">
              {quickActions.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  onClick={() => openWidget(action.type)}
                  className="quiet-surface group flex min-h-[108px] flex-col items-center justify-center gap-3 p-4 text-center transition"
                >
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-lg transition ${widgetIconChipClass(action.type)}`}
                  >
                    <action.icon size={21} aria-hidden />
                  </div>
                  <div>
                    <div className="text-sm font-black text-[color:var(--foreground-main)]">{action.title}</div>
                    <div className="mt-1 text-[11px] font-semibold text-[color:var(--foreground-muted)]">{action.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <div className="absolute inset-0 z-20 pointer-events-none">
        {widgets.map((widget) => (
          <AdaptiveWidgetShell
            key={widget.id}
            id={widget.id}
            title={widgetTitles[widget.type]}
            onClose={() => closeWidget(widget.id)}
            initialOffset={widget.position}
            size={widget.size}
            zIndex={widget.zIndex}
            isMaximized={widget.isMaximized}
            zoom={widget.zoom}
            onFocus={() => focusWidget(widget.id)}
            onPositionChange={(pos) => updateWidgetPosition(widget.id, pos)}
            onResize={(s) => updateWidgetSize(widget.id, s)}
            onMaximize={() => toggleMaximize(widget.id)}
            onZoomChange={(delta) => updateZoom(widget.id, delta)}
            workspaceBoundsRef={workspaceBoundsRef}
          >
            {widget.type === "project" && <ProjectWidget projectName={String(widget.liveData?.name || "Search")} />}
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
            {widget.type === "projectBoard" && <ProjectBoardWidget />}
            {widget.type === "crmTable" && <CrmTableWidget />}
            {widget.type === "erpArchive" && <ErpFileArchiveWidget />}
            {widget.type === "docCreator" && <DocumentCreatorWidget />}
            {widget.type === "aiScanner" && <AiScannerWidget />}
            {widget.type === "aiChatFull" && <AiChatFullWidget />}
            {widget.type === "settings" && <SettingsWidget />}
            {widget.type === "meckanoReports" && <MeckanoReportsWidget />}
            {widget.type === "googleDrive" && <GoogleDriveWidget />}
            {widget.type === "googleAssistant" && <GoogleAssistantWidget />}
            {widget.type === "notebookLM" && <NotebookLMWidget />}
          </AdaptiveWidgetShell>
        ))}
      </div>
    </div>
  );
}
