"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React, { useEffect } from "react";
import type { ActiveWidget, WidgetType } from "@/hooks/use-window-manager";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import {
  BarChart3,
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
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";

const ICONS: Partial<Record<WidgetType, typeof LayoutDashboard>> = {
  dashboard: LayoutDashboard,
  projectBoard: BarChart3,
  crmTable: Users,
  erpArchive: Package,
  docCreator: FilePlus,
  aiScanner: ScanLine,
  aiChatFull: Sparkles,
  meckanoReports: FileText,
  notebookLM: Library,
  settings: Settings,
};

export type WindowSwitcherProps = {
  open: boolean;
  onClose: () => void;
  widgets: ActiveWidget[];
  widgetTitle: (type: WidgetType) => string;
  onSelect: (id: string) => void;
  onCloseWidget: (id: string) => void;
};

export default function WindowSwitcher({
  open,
  onClose,
  widgets,
  widgetTitle,
  onSelect,
  onCloseWidget,
}: WindowSwitcherProps) {
  const { t, dir } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t("workspaceWidgets.windowSwitcher.title")}
      titleId="window-switcher-title"
      zIndex={1300}
    >
      {widgets.length === 0 ? (
        <p className="text-center text-sm text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.windowSwitcher.empty")}
        </p>
      ) : (
        <ul className="grid gap-2" dir={dir}>
          {widgets.map((w) => {
            const Icon = ICONS[w.type] ?? LayoutDashboard;
            return (
              <li key={w.id}>
                <div className="flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 p-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelect(w.id);
                      onClose();
                    }}
                    className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-start transition hover:bg-[color:var(--surface-soft)]"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${widgetIconChipClass(w.type)}`}
                    >
                      <Icon size={18} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-[color:var(--foreground-main)]">
                        {widgetTitle(w.type)}
                      </span>
                      <span className="text-[10px] text-[color:var(--foreground-muted)]">{w.id.slice(0, 12)}…</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onCloseWidget(w.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-500 hover:bg-rose-500/10"
                  >
                    {t("workspaceWidgets.windowSwitcher.closeWindow")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </OsFloatingPanel>
  );
}
