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
import { SQM_UNIT } from "./types";
import type { TakeoffState } from "./useTakeoffState";

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
            <button
              type="button"
              onClick={() => setMode(mode === "pan" ? "idle" : "pan")}
              title={t("workspaceWidgets.takeoff.pan")}
              aria-label={t("workspaceWidgets.takeoff.pan")}
              className={`rounded-lg p-2 transition-colors ${
                mode === "pan"
                  ? "bg-[color:var(--win-accent,#6366f1)] text-white"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              <Move className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => applyZoomAtPoint(1.2)}
              title={t("workspaceWidgets.takeoff.zoomIn")}
              aria-label={t("workspaceWidgets.takeoff.zoomIn")}
              className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)]"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => applyZoomAtPoint(1 / 1.2)}
              title={t("workspaceWidgets.takeoff.zoomOut")}
              aria-label={t("workspaceWidgets.takeoff.zoomOut")}
              className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)]"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="min-w-[3rem] text-center font-mono text-xs text-[color:var(--foreground-muted)]">
              {Math.round(scale * 100)}%
            </span>

            <div className="mx-1 h-6 w-px bg-[color:var(--border-main)]" />

            {/* מדידה */}
            <button
              type="button"
              onClick={() => {
                setMode("calibrate");
                setCalibrationPoints([]);
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                mode === "calibrate"
                  ? "bg-[color:var(--win-accent,#6366f1)] text-white"
                  : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              <Ruler className="h-4 w-4" />
              {t("workspaceWidgets.takeoff.calibrate")}
            </button>
            <button
              type="button"
              onClick={() => setMode("measure")}
              disabled={!ppm}
              title={!ppm ? t("workspaceWidgets.takeoff.needCalibrate") : ""}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                !ppm
                  ? "cursor-not-allowed text-[color:var(--foreground-muted)] opacity-50"
                  : mode === "measure"
                    ? "bg-[color:var(--win-accent,#6366f1)] text-white"
                    : "text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              }`}
            >
              <Hexagon className="h-4 w-4" />
              {t("workspaceWidgets.takeoff.measurePolygon")}
            </button>
            <button
              type="button"
              onClick={undoLastPoint}
              disabled={mode !== "measure" || measurePoints.length === 0}
              title={t("workspaceWidgets.takeoff.undo")}
              aria-label={t("workspaceWidgets.takeoff.undo")}
              className="rounded-lg p-2 text-[color:var(--foreground-muted)] transition-colors hover:bg-[color:var(--surface-soft)] disabled:opacity-40"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={resetMeasurement}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-rose-500 transition-colors hover:bg-rose-500/10"
            >
              <Trash2 className="h-4 w-4" />
              {t("workspaceWidgets.takeoff.clear")}
            </button>
          </>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        {ppm ? (
          <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 font-mono text-emerald-600 dark:text-emerald-400">
            {t("workspaceWidgets.takeoff.areaResult")}{" "}
            <span className="text-lg font-bold">{currentArea.toFixed(2)}</span> {SQM_UNIT}
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
