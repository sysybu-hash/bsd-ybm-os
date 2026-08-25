"use client";

import React from "react";
import {
  Ruler,
  Hexagon,
  Upload,
  Save,
  Trash2,
  Undo2,
  Move,
  ZoomIn,
  ZoomOut,
  Loader2,
} from "lucide-react";
import type { TakeoffState } from "./useTakeoffState";
import { OsButton, OsIconButton } from "@/components/os/ui";

type TakeoffToolbarProps = {
  state: TakeoffState;
  /** שמירה בתהליך — משבית את כפתור השמירה */
  saving: boolean;
};

export function TakeoffToolbar({ state, saving }: TakeoffToolbarProps) {
  const {
    t,
    imageSrc,
    isLoading,
    mode,
    setMode,
    ppm,
    scale,
    measurePoints,
    setCalibrationPoints,
    setDialog,
    resetMeasurement,
    handleFileUpload,
    currentArea,
    applyZoomAtPoint,
    undoLastPoint,
  } = state;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`flex items-center gap-2 rounded-lg bg-[color:var(--win-accent,#6366f1)] px-3 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 ${
            isLoading ? "cursor-wait opacity-70" : "cursor-pointer"
          }`}
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("workspaceWidgets.takeoff.loading")}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              {t("workspaceWidgets.takeoff.uploadDrawing")}
            </>
          )}
          <input
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => void handleFileUpload(e)}
            disabled={isLoading}
          />
        </label>

        {imageSrc ? (
          <>
            <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

            {/* ניווט */}
            <OsIconButton
              label={t("workspaceWidgets.takeoff.pan")}
              active={mode === "pan"}
              onClick={() => setMode(mode === "pan" ? "idle" : "pan")}
            >
              <Move className="h-4 w-4" aria-hidden />
            </OsIconButton>
            <OsIconButton label={t("workspaceWidgets.takeoff.zoomIn")} onClick={() => applyZoomAtPoint(1.2)}>
              <ZoomIn className="h-4 w-4" aria-hidden />
            </OsIconButton>
            <OsIconButton label={t("workspaceWidgets.takeoff.zoomOut")} onClick={() => applyZoomAtPoint(1 / 1.2)}>
              <ZoomOut className="h-4 w-4" aria-hidden />
            </OsIconButton>
            <span className="min-w-[3rem] text-center font-mono text-xs text-[color:var(--foreground-muted)]">
              {Math.round(scale * 100)}%
            </span>

            <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

            {/* מדידה */}
            <OsButton
              variant={mode === "calibrate" ? "primary" : "quiet"}
              icon={<Ruler className="h-4 w-4" aria-hidden />}
              onClick={() => {
                setMode("calibrate");
                setCalibrationPoints([]);
              }}
            >
              {t("workspaceWidgets.takeoff.calibrate")}
            </OsButton>
            <OsButton
              variant={mode === "measure" ? "primary" : "quiet"}
              disabled={!ppm}
              icon={<Hexagon className="h-4 w-4" aria-hidden />}
              title={!ppm ? t("workspaceWidgets.takeoff.needCalibrate") : ""}
              onClick={() => setMode("measure")}
            >
              {t("workspaceWidgets.takeoff.measurePolygon")}
            </OsButton>
            <OsIconButton
              label={t("workspaceWidgets.takeoff.undo")}
              disabled={mode !== "measure" || measurePoints.length === 0}
              onClick={undoLastPoint}
            >
              <Undo2 className="h-4 w-4" aria-hidden />
            </OsIconButton>
            <OsButton
              variant="quiet"
              className="text-rose-500 hover:bg-rose-500/10"
              icon={<Trash2 className="h-4 w-4" aria-hidden />}
              onClick={resetMeasurement}
            >
              {t("workspaceWidgets.takeoff.clear")}
            </OsButton>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {ppm ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-emerald-600 dark:text-emerald-400">
            {t("workspaceWidgets.takeoff.areaResult")}{" "}
            <span className="text-lg font-bold">{currentArea.toFixed(2)}</span>{" "}
            {t("workspaceWidgets.takeoff.sqmUnit")}
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => setDialog({ kind: "save", area: currentArea })}
          disabled={currentArea === 0 || saving}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {t("workspaceWidgets.takeoff.saveToBoq")}
        </button>
      </div>
    </div>
  );
}
