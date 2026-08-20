"use client";

import React from "react";
import Link from "next/link";
import { useI18n } from "@/components/os/system/I18nProvider";
import { CLASSIC_MORE_SECTIONS } from "@/lib/classic/sections";

export default function MoreTabPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-4 p-4">
      <h2 className="text-base font-bold text-[color:var(--classic-ink)]">
        {t("workspaceWidgets.classicDashboard.overview.quickActionsTitle")}
      </h2>
      <ul className="divide-y divide-[color:var(--classic-rule)] border-y border-[color:var(--classic-rule)]">
        {CLASSIC_MORE_SECTIONS.map(({ id, mobileHref, labelKey, icon: Icon }) => (
          <li key={id}>
            <Link
              href={mobileHref}
              className="flex items-center gap-3 py-3.5 transition-colors active:bg-[color:var(--surface-soft)]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center text-[color:var(--classic-accent)]">
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[color:var(--classic-ink)]">
                {t(labelKey)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
