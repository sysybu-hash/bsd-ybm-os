"use client";

import React from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  CLASSIC_NAV_GROUPS,
  classicSectionById,
  type ClassicSectionId,
} from "@/lib/classic/sections";

type ClassicSidebarProps = {
  activeTab: ClassicSectionId;
  onSelect: (id: ClassicSectionId) => void;
  t: (key: string) => string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
};

/**
 * סרגל צד למצב הקלאסי (דסקטופ) — קבוצות יומיום / כספים ומסמכים / כלים.
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
      className={`hidden shrink-0 flex-col border-e border-[color:var(--classic-rule)] bg-[color:var(--glass-bg)] py-3 transition-[width] duration-200 sm:flex ${
        collapsed ? "sm:w-[4.5rem] px-2" : "sm:w-60 px-3"
      }`}
    >
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
        className={`mb-3 flex h-9 items-center gap-2 rounded-lg px-2.5 text-[color:var(--classic-muted)] transition-colors hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--classic-ink)] ${
          collapsed ? "justify-center" : "justify-start"
        }`}
      >
        {collapsed ? (
          <PanelLeftOpen size={18} className="rtl:rotate-180" aria-hidden />
        ) : (
          <PanelLeftClose size={18} className="rtl:rotate-180" aria-hidden />
        )}
      </button>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
        {CLASSIC_NAV_GROUPS.map((group) => (
          <div key={group.id} className="flex flex-col gap-0.5">
            {!collapsed ? (
              <p className="mb-1 px-2.5 text-[10px] font-bold uppercase tracking-wider text-[color:var(--classic-muted)]">
                {t(group.labelKey)}
              </p>
            ) : (
              <div className="mx-auto mb-1 h-px w-6 bg-[color:var(--classic-rule)]" aria-hidden />
            )}
            {group.sectionIds.map((id) => {
              const section = classicSectionById(id);
              if (!section) return null;
              const { labelKey, icon: Icon } = section;
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? "page" : undefined}
                  title={collapsed ? t(labelKey) : undefined}
                  className={`group relative flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
                    collapsed ? "justify-center" : "justify-start"
                  } ${
                    active
                      ? "font-bold text-[color:var(--classic-ink)]"
                      : "font-medium text-[color:var(--classic-muted)] hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--classic-ink)]"
                  }`}
                >
                  {active ? (
                    <span
                      className="absolute inset-y-1 start-0 w-[3px] rounded-full bg-[color:var(--classic-accent)]"
                      aria-hidden
                    />
                  ) : null}
                  <Icon size={20} className="shrink-0" aria-hidden />
                  {!collapsed ? <span className="truncate">{t(labelKey)}</span> : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}
