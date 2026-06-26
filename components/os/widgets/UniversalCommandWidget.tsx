"use client";

import React from "react";
import { Cpu, FilePlus, FolderPlus, Sparkles, type LucideIcon } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { OpenWorkspaceWidgetFn } from "@/components/os/widgets/crm-table/types";
import { useI18n } from "@/components/os/system/I18nProvider";
import WindowBody from "@/components/os/layout/WindowBody";

type UniversalCommandWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: OpenWorkspaceWidgetFn;
};

type CommandAction = {
  key: "project" | "document" | "scan" | "generator";
  icon: LucideIcon;
  /** Logical widget name — resolveWidgetOpen maps it to the right hub + tab. */
  target: WidgetType;
  /** Optional liveData passed to the opened widget. */
  liveData?: Record<string, unknown> | null;
  /** Tailwind accent class fragment per category. */
  accent: string;
};

const ACTIONS: CommandAction[] = [
  { key: "project", icon: FolderPlus, target: "project", liveData: { action: "create" }, accent: "amber" },
  { key: "document", icon: FilePlus, target: "docCreator", accent: "blue" },
  { key: "scan", icon: Sparkles, target: "aiScanner", accent: "purple" },
  { key: "generator", icon: Cpu, target: "appBuilder", accent: "emerald" },
];

const ACCENT: Record<string, { icon: string; badge: string; hover: string; heading: string }> = {
  amber: {
    icon: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    badge: "border-amber-500/20 bg-amber-500/5 text-amber-600 dark:text-amber-400",
    hover: "hover:border-amber-500/40",
    heading: "group-hover:text-amber-600 dark:group-hover:text-amber-400",
  },
  blue: {
    icon: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    badge: "border-blue-500/20 bg-blue-500/5 text-blue-600 dark:text-blue-400",
    hover: "hover:border-blue-500/40",
    heading: "group-hover:text-blue-600 dark:group-hover:text-blue-400",
  },
  purple: {
    icon: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
    badge: "border-purple-500/20 bg-purple-500/5 text-purple-600 dark:text-purple-400",
    hover: "hover:border-purple-500/40",
    heading: "group-hover:text-purple-600 dark:group-hover:text-purple-400",
  },
  emerald: {
    icon: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    badge: "border-emerald-500/20 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400",
    hover: "hover:border-emerald-500/40",
    heading: "group-hover:text-emerald-600 dark:group-hover:text-emerald-400",
  },
};

export default function UniversalCommandWidget({
  openWorkspaceWidget,
}: UniversalCommandWidgetProps) {
  const { t, dir } = useI18n();

  return (
    <WindowBody className="gap-6 p-3 md:p-6" dir={dir}>
      <header className="border-b border-[color:var(--border-main)] pb-4">
        <h2 className="text-xl font-bold text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.commandCenter.title")}
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--foreground-muted)]">
          {t("workspaceWidgets.commandCenter.subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ACTIONS.map((action) => {
          const accent = ACCENT[action.accent]!;
          const Icon = action.icon;
          const heading = t(`workspaceWidgets.commandCenter.cards.${action.key}.heading`);
          return (
            <button
              key={action.key}
              type="button"
              onClick={() => openWorkspaceWidget?.(action.target, action.liveData ?? null)}
              aria-label={heading}
              className={`group flex min-h-[44px] flex-col rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-5 text-start shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:bg-[color:var(--surface-soft)] ${accent.hover}`}
            >
              <div className="mb-3 flex items-center justify-between">
                <span className={`rounded-lg p-2.5 transition-all ${accent.icon}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className={`rounded border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider ${accent.badge}`}>
                  {t(`workspaceWidgets.commandCenter.cards.${action.key}.badge`)}
                </span>
              </div>
              <h3 className={`text-base font-semibold text-[color:var(--foreground-main)] transition-colors ${accent.heading}`}>
                {heading}
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-[color:var(--foreground-muted)]">
                {t(`workspaceWidgets.commandCenter.cards.${action.key}.desc`)}
              </p>
            </button>
          );
        })}
      </div>
    </WindowBody>
  );
}
