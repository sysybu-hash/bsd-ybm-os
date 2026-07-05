"use client";

import React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { CLASSIC_SECTIONS, type ClassicSectionId } from "@/lib/classic/sections";

type ClassicSidebarProps = {
  activeTab: ClassicSectionId;
  onSelect: (id: ClassicSectionId) => void;
  t: (key: string) => string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * סרגל צד מודרני למצב הקלאסי (דסקטופ). מתקפל לאייקונים בלבד או פורש עם טקסט,
 * נבנה מ-CLASSIC_SECTIONS (מקור אמת יחיד). מחליף בעבר את ה-<nav> הפנימי ב-DashboardShell.
 */
export function ClassicSidebar({
  activeTab,
  onSelect,
  t,
  collapsed,
  onToggleCollapsed,
}: ClassicSidebarProps) {
  return (
    <nav
      aria-label={t("workspaceWidgets.classicDashboard.title")}
      data-collapsed={collapsed ? "true" : undefined}
      className={`hidden shrink-0 flex-col border-e border-[color:var(--border-main)] bg-[color:var(--glass-bg)] py-3 backdrop-blur-xl transition-[width] duration-200 sm:flex ${
        collapsed ? "sm:w-[4.5rem] px-2" : "sm:w-60 px-3"
      }`}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapsed}
        aria-label={
          collapsed
            ? t("workspaceWidgets.classicDashboard.sidebar.expand")
            : t("workspaceWidgets.classicDashboard.sidebar.collapse")
        }
        title={
          collapsed
            ? t("workspaceWidgets.classicDashboard.sidebar.expand")
            : t("workspaceWidgets.classicDashboard.sidebar.collapse")
        }
        className={`mb-2 flex h-9 items-center gap-2 rounded-xl px-2.5 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)] ${
          collapsed ? "justify-center" : "justify-start"
        }`}
    >
        {collapsed ? (
          <PanelLeftOpen size={18} className="rtl:rotate-180" aria-hidden />
        ) : (
          <PanelLeftClose size={18} className="rtl:rotate-180" aria-hidden />
        )}
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {CLASSIC_SECTIONS.map(({ id, labelKey, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelect(id)}
              aria-current={active ? "page" : undefined}
              title={collapsed ? t(labelKey) : undefined}
              className={`group flex items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm font-bold transition-colors ${
                collapsed ? "justify-center" : "justify-start"
              } ${
                active
                  ? "bg-[color:var(--accent-soft)] text-[color:var(--accent)]"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
              }`}
            >
              <Icon size={20} className="shrink-0" aria-hidden />
              {!collapsed ? <span className="truncate">{t(labelKey)}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
