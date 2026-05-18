"use client";

import React from "react";
import { RotateCcw, X } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";

export default function LauncherEditBanner() {
  const { t } = useI18n();
  const { editMode, exitEditMode, resetToDefault } = useLauncherConfig();

  if (!editMode) return null;

  return (
    <div
      className="fixed inset-x-0 top-[calc(4rem+env(safe-area-inset-top,0px))] z-[1300] flex items-center justify-center px-3 md:top-20"
      role="status"
      data-testid="launcher-edit-banner"
    >
      <div className="flex w-full max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border border-indigo-500/40 bg-indigo-950/90 px-3 py-2 text-white shadow-lg backdrop-blur-md">
        <p className="text-xs font-semibold sm:text-sm">{t("workspaceWidgets.launcher.editHint")}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={resetToDefault}
            className="inline-flex items-center gap-1 rounded-lg border border-white/20 px-2 py-1 text-[11px] font-bold hover:bg-white/10"
          >
            <RotateCcw size={14} aria-hidden />
            {t("workspaceWidgets.launcher.resetDefault")}
          </button>
          <button
            type="button"
            onClick={exitEditMode}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-black text-indigo-900"
            data-testid="launcher-edit-done"
          >
            <X size={14} aria-hidden />
            {t("workspaceWidgets.launcher.done")}
          </button>
        </div>
      </div>
    </div>
  );
}
