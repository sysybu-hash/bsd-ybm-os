"use client";

import React from "react";
import { CommandCenterCanvas } from "./command-center/CommandCenterCanvas";
import { BlueprintForkDialog } from "./blueprint/BlueprintForkDialog";
import type { useAiScannerState } from "@/components/os/widgets/ai-scanner/useAiScannerState";

type ScannerState = ReturnType<typeof useAiScannerState>;

type DocumentScanShellProps = {
  state: ScannerState;
  embeddedInHub?: boolean;
  /** מצב קומפקטי — ללא בורר מנועים (הוצאות משרד) */
  compactMode?: boolean;
  /** false כשסרגל-כותרת חיצוני כבר מציג בקרות מנוע/סריקה — הקנבאס לא ישכפל אותן */
  showIntakeControls?: boolean;
};

/**
 * מעטפת הסורק — Command Center: קנבאס יחיד מפוצל שבו המסמך, החילוץ-החי,
 * לוח המנועים והשמירה גלויים בו-זמנית (מחליף את זרימת 4 השלבים הישנה).
 */
export function DocumentScanShell({ state, compactMode = false, showIntakeControls = true }: DocumentScanShellProps) {
  const { tr, scanQueue } = state;
  const {
    pendingAnalysis,
    previewFileName,
    showBlueprintFork,
    dismissBlueprintFork,
    openTakeoffForBlueprint,
    approveBlueprintBoq,
    lastScanFileName,
    goBackScanStep,
    sessionPhase,
  } = scanQueue;

  return (
    <>
      <CommandCenterCanvas state={state} compactMode={compactMode} showControls={showIntakeControls} />
      <BlueprintForkDialog
        open={showBlueprintFork}
        fileName={lastScanFileName || previewFileName}
        tr={tr}
        onApproveAi={() => void approveBlueprintBoq()}
        onTakeoff={openTakeoffForBlueprint}
        onDismiss={dismissBlueprintFork}
      />
      {sessionPhase === "review" && pendingAnalysis ? null : (
        <button type="button" className="sr-only" onClick={goBackScanStep} aria-hidden />
      )}
    </>
  );
}
