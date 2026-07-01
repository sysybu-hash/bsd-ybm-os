"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import { UTILITY_TABS } from "@/lib/utility-rail/tabs";
import type { UtilityRailTab } from "@/lib/utility-rail/prefs";

type Props = {
  activeTab: UtilityRailTab | null;
  open: boolean;
  onTabClick: (tab: UtilityRailTab) => void;
};

export default function UtilityTabStrip({ activeTab, open, onTabClick }: Props) {
  const { t } = useI18n();

  return (
    <div
      className="flex flex-col gap-1"
      role="tablist"
      aria-orientation="vertical"
      aria-label={t("workspaceWidgets.utilityRail.title")}
    >
      {UTILITY_TABS.map((tab) => {
        const Icon = tab.icon;
        const selected = open && activeTab === tab.id;
        const label = t(tab.labelKey);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-expanded={selected}
            aria-label={label}
            title={label}
            onClick={() => onTabClick(tab.id)}
            className={`os-utility-rail-tab flex min-h-[44px] min-w-[var(--os-utility-rail-tab-width)] items-center justify-center rounded-s-xl border transition ${
              selected
                ? "border-indigo-400/50 bg-indigo-500/15 text-[color:var(--win-accent,#6366f1)] dark:text-indigo-300"
                : "border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--win-accent,#6366f1)] shadow-sm dark:text-indigo-300 hover:bg-[color:var(--surface-soft)]"
            }`}
          >
            <Icon size={20} strokeWidth={1.75} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
