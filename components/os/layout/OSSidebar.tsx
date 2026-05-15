"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  FilePlus,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Package,
  ScanLine,
  Settings,
  Sparkles,
  Users,
  Library,
} from "lucide-react";
import { WidgetType } from "@/hooks/use-window-manager";
import { helpIconChipClass, widgetIconChipClass } from "@/lib/widget-icon-chip";

interface OSSidebarProps {
  openWidget: (type: WidgetType) => void;
  isOpen?: boolean;
  closeSidebar?: () => void;
}

const navItems = [
  { id: "dashboard", icon: LayoutDashboard, label: "דאשבורד", type: "dashboard" as WidgetType },
  { id: "projectBoard", icon: BarChart3, label: "פרויקטים", type: "projectBoard" as WidgetType },
  { id: "crmTable", icon: Users, label: "לקוחות", type: "crmTable" as WidgetType },
  { id: "erpArchive", icon: Package, label: "ארכיון ERP", type: "erpArchive" as WidgetType },
  { id: "docCreator", icon: FilePlus, label: "מסמכים", type: "docCreator" as WidgetType },
  { id: "aiScanner", icon: ScanLine, label: "סורק AI", type: "aiScanner" as WidgetType },
  { id: "aiChatFull", icon: Sparkles, label: "צ׳אט AI", type: "aiChatFull" as WidgetType },
  { id: "meckanoReports", icon: FileText, label: "דוחות Meckano", type: "meckanoReports" as WidgetType },
  { id: "notebookLM", icon: Library, label: "NotebookLM", type: "notebookLM" as WidgetType },
];

export default function OSSidebar({ openWidget, isOpen = false, closeSidebar }: OSSidebarProps) {
  return (
    <>
      {isOpen && (
        <button type="button" className="fixed inset-0 z-[1150] hidden bg-slate-950/45 backdrop-blur-[2px] md:block" onClick={closeSidebar} aria-label="סגור ניווט" />
      )}

      <motion.aside
        initial={{ x: 24, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] as const }}
        className={`fixed z-[1200] hidden flex-col border-[color:var(--border-main)] bg-[color:var(--glass-bg)] shadow-md backdrop-blur-sm transition-transform duration-200 md:flex
          bottom-0 left-0 right-0 h-auto w-full items-stretch border-t px-3 py-2
          ${isOpen ? "translate-y-0" : "translate-y-0"}
          md:bottom-28 md:left-auto md:right-5 md:top-24 md:min-h-0 md:w-[3.75rem] md:max-w-[3.75rem] md:rounded-xl md:border md:px-1.5 md:py-3`}
        aria-label="ניווט סביבת עבודה"
      >
        <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
          <nav
            aria-label="יישומים"
            className="custom-scrollbar flex min-h-0 flex-1 flex-row items-center justify-around gap-1 overflow-x-auto overflow-y-hidden overscroll-contain py-0.5 md:flex-col md:justify-start md:gap-2.5 md:overflow-x-hidden md:overflow-y-auto md:px-0.5 md:py-0.5"
          >
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openWidget(item.type)}
                className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
                title={item.label}
                aria-label={item.label}
              >
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass(item.type)}`}
                >
                  <item.icon size={19} aria-hidden />
                </span>
                <span className="pointer-events-none absolute right-14 z-50 hidden whitespace-nowrap rounded-md border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-[11px] font-bold text-[color:var(--foreground-main)] opacity-0 shadow-sm transition-opacity group-hover:opacity-100 md:block">
                  {item.label}
                </span>
              </button>
            ))}
          </nav>

          <div className="flex shrink-0 items-center justify-around gap-1 border-t border-[color:var(--border-main)] pt-2 md:mt-1 md:flex-col md:justify-start md:gap-2 md:border-t md:pt-2">
          <button
            type="button"
            onClick={() => openWidget("settings")}
            className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
            aria-label="הגדרות"
            title="הגדרות"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass("settings")}`}>
              <Settings size={19} aria-hidden />
            </span>
          </button>
          <button
            type="button"
            onClick={() => openWidget("aiChatFull")}
            className="group flex h-11 w-11 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)]"
            aria-label="עזרה"
            title="עזרה"
          >
            <span className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${helpIconChipClass}`}>
              <HelpCircle size={19} aria-hidden />
            </span>
          </button>
          </div>
        </div>
      </motion.aside>
    </>
  );
}
