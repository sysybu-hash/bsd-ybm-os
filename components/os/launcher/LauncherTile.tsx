"use client";

import React from "react";
import { LayoutGrid, Plus, X } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import {
  getLauncherNavMeta,
  quickActionLabelKey,
  quickActionSubtitleKey,
} from "@/lib/launcher/launcher-icons";
import { normalizeWidgetAction } from "@/lib/os-assistant/widget-catalog";
import { widgetIconChipClass } from "@/lib/widget-icon-chip";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useLauncherConfig } from "@/components/os/launcher/LauncherConfigProvider";
import type { GridCellCoord } from "@/lib/launcher/quick-grid";
import type { LauncherZone } from "@/lib/launcher/user-launcher-config";

type LauncherTileProps = {
  zone: LauncherZone;
  slotIndex: number;
  gridCoord?: GridCellCoord;
  widgetId: WidgetType | null;
  onOpen: (type: WidgetType) => void;
  variant: "quick" | "sidebar" | "mobile";
  /** רשת 3 עמודות במובייל — אריח קומפקטי */
  tileSize?: "default" | "mobile";
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
  isDragging?: boolean;
};

export default function LauncherTile({
  zone,
  slotIndex,
  gridCoord,
  widgetId,
  onOpen,
  variant,
  tileSize = "default",
  dragHandleProps,
  isDragging,
}: LauncherTileProps) {
  const { t } = useI18n();
  const { editMode, removeAt, openPickerAt } = useLauncherConfig();
  const resolvedWidgetId = widgetId ? normalizeWidgetAction(widgetId) : null;
  const meta = resolvedWidgetId ? getLauncherNavMeta(resolvedWidgetId) : null;
  const Icon = meta?.icon ?? LayoutGrid;
  const isEmpty = !resolvedWidgetId;

  const label = resolvedWidgetId
    ? variant === "quick"
      ? t(quickActionLabelKey(resolvedWidgetId))
      : t(meta!.labelKey)
    : t("workspaceWidgets.launcher.emptySlot");

  const handleClick = () => {
    if (editMode) {
      openPickerAt(zone, slotIndex, gridCoord);
      return;
    }
    if (resolvedWidgetId) onOpen(resolvedWidgetId);
  };

  if (variant === "sidebar") {
    return (
      <div
        className={`relative ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}
        data-testid={resolvedWidgetId ? `launcher-tile-${resolvedWidgetId}` : "launcher-tile-empty"}
      >
        {editMode ? (
          <button
            type="button"
            className="absolute -end-1 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white shadow"
            aria-label={t("workspaceWidgets.launcher.remove")}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(zone, slotIndex, gridCoord);
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
          ) : (
            <span
              className={`flex h-9 w-9 items-center justify-center rounded-lg transition ${widgetIconChipClass(resolvedWidgetId)}`}
            >
              <Icon size={19} aria-hidden />
            </span>
          )}
        </button>
      </div>
    );
  }

  if (variant === "mobile") {
    return (
      <div className={`relative min-w-0 ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}>
        {editMode && resolvedWidgetId ? (
          <button
            type="button"
            className="absolute -end-0.5 -top-0.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-white"
            aria-label={t("workspaceWidgets.launcher.remove")}
            onClick={(e) => {
              e.stopPropagation();
              removeAt(zone, slotIndex, gridCoord);
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
          ) : (
            <>
              {meta?.chip ? (
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10 ${widgetIconChipClass(resolvedWidgetId)}`}
                >
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                </span>
              ) : (
                <Icon size={21} strokeWidth={1.75} aria-hidden />
              )}
              <span className="max-w-full truncate px-0.5 text-[8px] font-bold sm:text-[9px]">{label}</span>
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div
      className={`relative ${editMode ? "launcher-jiggle" : ""} ${isDragging ? "opacity-60" : ""}`}
      data-testid={resolvedWidgetId ? `launcher-quick-${resolvedWidgetId}` : "launcher-quick-empty"}
    >
      {editMode && widgetId ? (
        <button
          type="button"
          className="absolute end-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white shadow"
          aria-label={t("workspaceWidgets.launcher.remove")}
          onClick={(e) => {
            e.stopPropagation();
            removeAt(zone, slotIndex, gridCoord);
          }}
        >
          <X size={14} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={handleClick}
        className={`quiet-surface group flex flex-none flex-col items-center justify-center text-center transition ${
          tileSize === "mobile"
            ? "h-[100px] w-full max-w-[112px] gap-1.5 p-2"
            : "h-[140px] w-[140px] gap-3 p-4"
        } ${isEmpty && editMode ? "border-2 border-dashed border-indigo-400/50" : ""} ${
          isEmpty && !editMode ? "hidden" : ""
        }`}
        {...(editMode ? dragHandleProps : {})}
      >
        {isEmpty ? (
          <>
            <Plus
              size={tileSize === "mobile" ? 22 : 28}
              className="text-indigo-400"
              aria-hidden
            />
            <span
              className={`font-bold text-[color:var(--foreground-muted)] ${
                tileSize === "mobile" ? "text-[10px]" : "text-sm"
              }`}
            >
              {label}
            </span>
          </>
        ) : (
          <>
            <div
              className={`flex shrink-0 items-center justify-center rounded-lg transition ${widgetIconChipClass(resolvedWidgetId)} ${
                tileSize === "mobile" ? "h-8 w-8" : "h-11 w-11"
              }`}
            >
              <Icon size={tileSize === "mobile" ? 18 : 22} strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 w-full px-0.5">
              <div
                className={`font-black leading-tight text-[color:var(--foreground-main)] ${
                  tileSize === "mobile" ? "text-[10px]" : "text-sm"
                }`}
              >
                {label}
              </div>
              <div
                className={`font-semibold leading-tight text-[color:var(--foreground-muted)] ${
                  tileSize === "mobile" ? "mt-0.5 line-clamp-2 text-[8px]" : "mt-1 text-[11px]"
                }`}
              >
                {t(quickActionSubtitleKey(resolvedWidgetId))}
              </div>
            </div>
          </>
        )}
      </button>
    </div>
  );
}
