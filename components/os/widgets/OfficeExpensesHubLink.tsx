"use client";

import { Building2, ChevronLeft, ChevronRight } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { WidgetType } from "@/hooks/use-window-manager";

type Props = {
  openWorkspaceWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  variant?: "finance" | "project";
};

export default function OfficeExpensesHubLink({ openWorkspaceWidget, variant = "finance" }: Props) {
  const { t, dir } = useI18n();
  const Arrow = dir === "rtl" ? ChevronLeft : ChevronRight;

  const titleKey =
    variant === "project"
      ? "workspaceWidgets.officeExpenses.projectLinkTitle"
      : "workspaceWidgets.officeExpenses.hubLinkTitle";
  const descKey =
    variant === "project"
      ? "workspaceWidgets.officeExpenses.projectLinkDesc"
      : "workspaceWidgets.officeExpenses.hubLinkDesc";

  return (
    <button
      type="button"
      onClick={() => openWorkspaceWidget("executiveHub", { tab: "officeExpenses" })}
      className="mb-4 flex w-full items-center gap-3 rounded-xl border border-indigo-200/80 bg-indigo-50/60 px-4 py-3 text-start transition hover:border-indigo-300 hover:bg-indigo-50 dark:border-indigo-800/50 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color:var(--win-accent,#6366f1)] text-white">
        <Building2 className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-[color:var(--foreground-main)]">
          {t(titleKey)}
        </span>
        <span className="mt-0.5 block text-xs text-[color:var(--foreground-muted)]">{t(descKey)}</span>
      </span>
      <Arrow className="h-4 w-4 shrink-0 text-[color:var(--win-accent,#6366f1)]" aria-hidden />
    </button>
  );
}
