"use client";

import React from "react";
import { X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import {
  BarChart3,
  Calendar,
  FilePlus,
  FileText,
  LayoutDashboard,
  Library,
  Package,
  ScanLine,
  Settings,
  Sparkles,
  Users,
} from "lucide-react";

const ICONS: Partial<Record<WidgetType, typeof LayoutDashboard>> = {
  dashboard: LayoutDashboard,
  projectBoard: BarChart3,
  crmTable: Users,
  erpArchive: Package,
  docCreator: FilePlus,
  aiScanner: ScanLine,
  aiChatFull: Sparkles,
  meckanoReports: FileText,
  googleCalendar: Calendar,
  notebookLM: Library,
  settings: Settings,
};

type MinimizedWidgetsBarProps = {
  widgets: ActiveWidget[];
  widgetTitle: (type: WidgetType) => string;
  onRestore: (id: string) => void;
  onClose: (id: string) => void;
};

export default function MinimizedWidgetsBar({
  widgets,
  widgetTitle,
  onRestore,
  onClose,
}: MinimizedWidgetsBarProps) {
  const { t, dir } = useI18n();
  const minimized = widgets.filter((w) => w.isMinimized);
  if (minimized.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[1050] flex justify-center px-2 md:px-4"
      style={{
        bottom: "calc(var(--minimized-dock-bottom, 5.75rem) + env(safe-area-inset-bottom, 0px))",
      }}
      dir={dir}
      role="region"
      aria-label={t("workspaceWidgets.minimizedDock.aria")}
    >
      <div className="pointer-events-auto workspace-minimized-dock flex max-w-full items-center gap-2 overflow-x-auto custom-scrollbar px-2 py-1.5">
        {minimized.map((w) => {
          const Icon = ICONS[w.type] ?? LayoutDashboard;
          return (
            <div
              key={w.id}
              className="workspace-minimized-chip flex shrink-0 items-center gap-1 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/95 shadow-lg backdrop-blur-md"
            >
              <button
                type="button"
                onClick={() => onRestore(w.id)}
                className="flex min-h-10 items-center gap-2 px-3 py-2 text-start transition hover:bg-[color:var(--surface-soft)] rounded-s-xl"
              >
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${widgetIconChipClass(w.type)}`}
                >
                  <Icon size={14} aria-hidden />
                </span>
                <span className="max-w-[9rem] truncate text-xs font-bold text-[color:var(--foreground-main)] md:max-w-[12rem]">
                  {widgetTitle(w.type)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onClose(w.id)}
                className="workspace-chrome-btn workspace-chrome-btn--danger inline-flex min-h-10 min-w-10 rounded-e-xl border-s border-[color:var(--border-main)]/50"
                aria-label={t("workspaceWidgets.chrome.closeAria", { title: widgetTitle(w.type) })}
              >
                <X size={14} aria-hidden />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
