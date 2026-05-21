"use client";

import React from "react";
import { X } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OS_ASSISTANT_WIDGETS } from "@/lib/os-assistant/widget-catalog";
import { getLauncherNavMeta } from "@/lib/launcher/launcher-icons";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import { splitIntoBalancedRows } from "@/lib/launcher/launcher-grid-layout";
import {
  LAUNCHER_PICKER_GRID_CONTAINER_CLASS,
  LAUNCHER_PICKER_ROW_CLASS,
  LAUNCHER_PICKER_TILE_CLASS,
} from "@/lib/launcher/user-launcher-config";

function widgetLabel(type: WidgetType, locale: string): string {
  const entry = OS_ASSISTANT_WIDGETS.find((w) => w.id === type);
  if (!entry) return type;
  if (locale === "en") return entry.labelEn;
  if (locale === "ru") return entry.labelRu;
  return entry.labelHe;
}

export default function LauncherPickerSheet() {
  const { locale, t } = useI18n();
  const { picker, closePicker, assignWidget, pickerOptions } = useLauncherConfig();

  if (!picker) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[1400] bg-slate-950/50 backdrop-blur-sm"
        aria-label={t("workspaceWidgets.launcher.closePicker")}
        onClick={closePicker}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("workspaceWidgets.launcher.pickerTitle")}
        data-testid="launcher-picker"
        className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 right-3 z-[1401] max-h-[60vh] overflow-y-auto rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 shadow-xl md:bottom-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2"
      >
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm font-bold text-[color:var(--foreground-main)]">
            {t("workspaceWidgets.launcher.pickerTitle")}
          </span>
          <button
            type="button"
            onClick={closePicker}
            className="rounded-lg p-2 hover:bg-[color:var(--surface-soft)]"
            aria-label={t("workspaceWidgets.launcher.closePicker")}
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className={LAUNCHER_PICKER_GRID_CONTAINER_CLASS}>
          {splitIntoBalancedRows(pickerOptions).map((row, rowIndex) => (
            <div key={`picker-row-${rowIndex}`} className={LAUNCHER_PICKER_ROW_CLASS}>
              {row.map((type) => {
                const meta = getLauncherNavMeta(type);
                const Icon = meta.icon;
                return (
                  <button
                    key={type}
                    type="button"
                    data-testid={`launcher-pick-${type}`}
                    onClick={() => assignWidget(type)}
                    className={`${LAUNCHER_PICKER_TILE_CLASS} flex flex-col items-center gap-2 rounded-lg border border-[color:var(--border-main)] p-3 transition hover:bg-[color:var(--surface-soft)]`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-lg ${widgetIconChipClass(type)}`}
                    >
                      <Icon size={20} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="text-center text-[11px] font-bold text-[color:var(--foreground-main)]">
                      {widgetLabel(type, locale)}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
