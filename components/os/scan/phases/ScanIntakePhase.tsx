"use client";

import React from "react";
import { ScanDropZone } from "@/components/os/widgets/ai-scanner/ScanDropZone";
import { ScanEngineBar } from "../shared/ScanEngineBar";
import type { EngineMeta } from "@/components/os/widgets/ai-scanner/types";
import type { TriEngineRunMode } from "@/lib/tri-engine-api-common";
import type { ScanModeUiSelection } from "@/lib/scan-modes-for-ui";
import type { QueueItem } from "@/components/os/widgets/ai-scanner/types";

type ScanIntakePhaseProps = {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  isProcessing: boolean;
  queue: QueueItem[];
  queueProgress: { current: number; total: number; name: string } | null;
  previewUrl: string | null;
  previewMime: string | null;
  previewFileName: string;
  fileAccept: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  cameraInputRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  applyFilePreview: (file: File) => void;
  engineRunMode: TriEngineRunMode;
  setEngineRunMode: (m: TriEngineRunMode) => void;
  customEngines?: string[];
  onCustomEnginesChange?: (engines: string[]) => void;
  engineMeta: EngineMeta | null;
  scanModeOverride: ScanModeUiSelection;
  setScanModeOverride: (m: ScanModeUiSelection) => void;
  scanModes: { id: ScanModeUiSelection; label: string }[];
  t: (key: string) => string;
  tr: (key: string, fallback: string) => string;
  showControls?: boolean;
  compact?: boolean;
};

export function ScanIntakePhase(props: ScanIntakePhaseProps) {
  const {
    engineRunMode,
    setEngineRunMode,
    customEngines,
    onCustomEnginesChange,
    engineMeta,
    scanModeOverride,
    setScanModeOverride,
    scanModes,
    tr,
    showControls = true,
    compact = false,
    ...dropProps
  } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {showControls ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border-main)]/60 px-3 py-2">
          <ScanEngineBar
            value={engineRunMode}
            onChange={setEngineRunMode}
            customEngines={customEngines}
            onCustomEnginesChange={onCustomEnginesChange}
            engineMeta={engineMeta}
            tr={tr}
          />
          <select
            value={scanModeOverride}
            onChange={(e) => setScanModeOverride(e.target.value as ScanModeUiSelection)}
            className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2 py-1 text-[11px] font-bold"
            aria-label={tr("workspaceWidgets.documentScan.scanMode", "מצב סריקה")}
          >
            {scanModes.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <ScanDropZone {...dropProps} tr={tr} t={dropProps.t} hasPendingAnalysis={false} compact={compact} />
    </div>
  );
}
