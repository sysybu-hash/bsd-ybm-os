"use client";

import React from "react";
import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";
import { CLASSIC_MORE_SECTIONS, type ClassicSectionId } from "@/lib/classic/sections";

/** Presentation-only gradient per section (the section list itself comes from the registry). */
const COLOR: Record<ClassicSectionId, string> = {
  tasks: "from-violet-400 to-purple-500",
  erp: "from-blue-400 to-indigo-500",
  customOs: "from-emerald-400 to-teal-500",
  calendar: "from-amber-400 to-orange-500",
  calculators: "from-pink-400 to-rose-500",
  drive: "from-cyan-400 to-sky-500",
  settings: "from-gray-400 to-slate-500",
  // never rendered here (primary / home), kept for type completeness
  home: "from-slate-400 to-slate-500",
  crm: "from-slate-400 to-slate-500",
  scan: "from-slate-400 to-slate-500",
  aiChat: "from-slate-400 to-slate-500",
};

export default function MoreTabPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5 p-4">
      <section>
        <h2 className="mb-3 text-sm font-extrabold text-[color:var(--foreground-main)]">
          {t("workspaceWidgets.classicDashboard.overview.quickActionsTitle")}
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {CLASSIC_MORE_SECTIONS.map(({ id, mobileHref, labelKey, icon: Icon }) => (
            <Link
              key={id}
              href={mobileHref}
              className="group flex items-center gap-3 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 transition-all hover:border-[color:var(--accent)]/40 active:scale-95"
            >
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow ${COLOR[id]}`}
              >
                <Icon size={18} strokeWidth={2.2} aria-hidden />
              </span>
              <span className="min-w-0 truncate text-xs font-bold text-[color:var(--foreground-main)]">
                {t(labelKey)}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
