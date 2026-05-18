"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import { getLauncherNavMeta, quickActionLabelKey } from "@/lib/launcher/launcher-icons";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import type { LauncherZone } from "@/lib/launcher/user-launcher-config";

type LauncherTileProps = {
  zone: LauncherZone;
  slotIndex: number;
  widgetId: WidgetType | null;
  onOpen: (type: WidgetType) => void;
  variant: "quick" | "sidebar" | "mobile";
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
};

export default function LauncherTile({
  zone,
  slotIndex,
  widgetId,
  onOpen,
  variant,
  dragHandleProps,
  isDragging,
}: LauncherTileProps) {
  const { t } = useI18n();
  const { editMode, removeAt, openPickerAt } = useLauncherConfig();
  const meta = widgetId ? getLauncherNavMeta(widgetId) : null;
  const Icon = meta?.icon;
  const isEmpty = !widgetId;

  const label = widgetId
    ? variant === "quick"
      ? t(quickActionLabelKey(widgetId))
      : t(meta?.labelKey ?? `workspaceWidgets.titles.${widgetId}`)
    : t("workspaceWidgets.launcher.emptySlot");

  const handleClick = () => {
    if (editMode) {
      openPickerAt(zone, slotIndex);
      return;
    }
    if (widgetId) onOpen(widgetId);
  };

  if (variant === "sidebar") {
    return (
      <div
        className={`relative ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}
        data-testid={widgetId ? `launcher-tile-${widgetId}` : "launcher-tile-empty"}
      >
        {editMode ? (
          <button
            type="button"
            className="absolute -end-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow"
            aria-label={t("workspaceWidgets.launcher.remove")}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(zone, slotIndex);
            }}
          >
            <X size={12} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleClick}
          className={`group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition hover:bg-[color:var(--surface-soft)] ${
            isEmpty && editMode ? "border border-dashed border-indigo-400/60" : ""
          }`}
          title={label}
          aria-label={label}
          {...(editMode ? dragHandleProps : {})}
        >
          {isEmpty ? (
            <Plus size={18} className="text-indigo-400" aria-hidden />
          ) : Icon ? (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass(widgetId)}`}
            >
              <Icon size={19} aria-hidden />
            </span>
          ) : null}
        </button>
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className={`relative min-w-0 ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}>
        {editMode && widgetId ? (
          <button
            type="button"
            className="absolute -end-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white"
            aria-label={t("workspaceWidgets.launcher.remove")}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(zone, slotIndex);
            }}
          >
            <X size={10} aria-hidden />
          </button>
        ) : null}
        <button
          type="button"
          onClick={handleClick}
          className={`flex min-h-[44px] w-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg py-0.5 text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] ${
            isEmpty && !editMode ? "invisible pointer-events-none" : ""
          }`}
          aria-label={label}
          {...(editMode ? dragHandleProps : {})}
        >
          {isEmpty ? (
            editMode ? (
              <Plus size={20} className="text-indigo-400" aria-hidden />
            ) : null
          ) : Icon ? (
            <>
              {meta?.chip ? (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${widgetIconChipClass(widgetId)}`}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
              ) : (
                <Icon size={21} strokeWidth={1.75} aria-hidden />
              )}
              <span className="max-w-full truncate px-0.5 text-[8px] font-bold sm:text-[9px]">{label}</span>
            </>
          ) : null}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}
      data-testid={widgetId ? `launcher-quick-${widgetId}` : "launcher-quick-empty"}
    >
      {editMode && widgetId ? (
        <button
          type="button"
          className="absolute end-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow"
          aria-label={t("workspaceWidgets.launcher.remove")}
          onClick={(e) => {
            e.stopPropagation();
            removeAt(zone, slotIndex);
          }}
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        className={`quiet-surface group flex min-h-[108px] w-full flex-col items-center justify-center gap-3 p-4 text-center transition ${
          isEmpty && editMode ? "border-2 border-dashed border-indigo-400/50" : ""
        } ${isEmpty && !editMode ? "hidden" : ""}`}
        {...(editMode ? dragHandleProps : {})}
      >
        {isEmpty ? (
          <>
            <Plus size={28} className="text-indigo-400" aria-hidden />
            <span className="text-sm font-bold text-[color:var(--foreground-muted)]">{label}</span>
          </>
        ) : Icon ? (
          <>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition ${widgetIconChipClass(widgetId)}`}
            >
              <Icon size={21} aria-hidden />
            </div>
            <div>
              <div className="text-sm font-black text-[color:var(--foreground-main)]">{label}</div>
              <div className="mt-1 text-[11px] font-semibold text-[color:var(--foreground-muted)]">
                {t(`workspaceWidgets.quickActions.${widgetId}.subtitle`)}
              </div>
            </div>
          </>
        ) : null}
      </button>
    </div>
  );
}
