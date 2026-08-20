"use client";

import React from "react";
import OsPromptDialog from "@/components/os/OsPromptDialog";
import { useTakeoffState } from "./takeoff/useTakeoffState";
import { TakeoffToolbar } from "./takeoff/TakeoffToolbar";
import { TakeoffCanvas } from "./takeoff/TakeoffCanvas";
import type { TakeoffMeasurement } from "./takeoff/types";

export type { TakeoffMeasurement } from "./takeoff/types";

export type TakeoffModuleProps = {
  /** נקרא בשמירת מדידה; ההורה כותב ל-API */
  onSaveMeasurement?: (measurement: TakeoffMeasurement) => void | Promise<void>;
  /** שמירה בתהליך — משבית את כפתור השמירה */
  saving?: boolean;
};

export default function TakeoffModule({ onSaveMeasurement, saving = false }: TakeoffModuleProps) {
  const state = useTakeoffState({ onSaveMeasurement });
  const { t, ppm, dialog, setDialog, setCalibrationPoints, confirmCalibration, confirmSave, statusText } = state;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]">
      <TakeoffToolbar state={state} saving={saving} />
      <TakeoffCanvas state={state} />

      {/* שורת סטטוס */}
      <div className="flex justify-between border-t border-[color:var(--border-main)] bg-[color:var(--surface-elevated)] p-2 text-xs text-[color:var(--foreground-muted)]">
        <span>{statusText}</span>
        {ppm ? (
          <span>{t("workspaceWidgets.takeoff.scaleInfo").replace("{ppm}", ppm.toFixed(2))}</span>
        ) : null}
      </div>

      {/* דיאלוג כיול */}
      <OsPromptDialog
        open={dialog.kind === "calibrate"}
        title={t("workspaceWidgets.takeoff.calibrateTitle")}
        label={t("workspaceWidgets.takeoff.calibrateLabel")}
        onConfirm={confirmCalibration}
        onCancel={() => {
          setCalibrationPoints([]);
          setDialog({ kind: "none" });
        }}
      />

      {/* דיאלוג שמירה */}
      <OsPromptDialog
        open={dialog.kind === "save"}
        title={t("workspaceWidgets.takeoff.saveTitle")}
        label={t("workspaceWidgets.takeoff.saveLabel")}
        defaultValue={t("workspaceWidgets.takeoff.defaultDescription")}
        onConfirm={confirmSave}
        onCancel={() => setDialog({ kind: "none" })}
      />
    </div>
  );
}
