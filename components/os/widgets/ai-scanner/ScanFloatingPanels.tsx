"use client";

import React from "react";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import ScanFilePreview from "@/components/os/widgets/scan/ScanFilePreview";
import ScanResultsPanel from "@/components/os/widgets/scan/ScanResultsPanel";
import type { TriEngineTelemetry } from "@/lib/tri-engine-extract";
import type { ScanExtractionV5 } from "@/lib/scan-schema-v5";
import type { DocumentAnalysis, QueueItem } from "./types";

type ScanFloatingPanelsProps = {
  tr: (key: string, fallback: string) => string;
  // Instructions panel
  instructionsOpen: boolean;
  setInstructionsOpen: (open: boolean) => void;
  userInstruction: string;
  persistInstruction: (value: string) => void;
  // Preview panel
  previewPanelOpen: boolean;
  setPreviewPanelOpen: (open: boolean) => void;
  previewUrl: string | null;
  previewMime: string | null;
  previewFileName: string;
  queue: QueueItem[];
  applyFilePreview: (file: File) => void;
  // Results panel
  resultsPanelOpen: boolean;
  setResultsPanelOpen: (open: boolean) => void;
  lastScanV5: ScanExtractionV5 | null;
  lastScanFileName: string;
  telemetry: TriEngineTelemetry | null;
  pendingAnalysis: DocumentAnalysis | null;
  confirmAnalysis: () => Promise<void>;
  saveToNotebook: () => Promise<void>;
  savingNotebook: boolean;
};

export function ScanFloatingPanels({
  tr,
  instructionsOpen, setInstructionsOpen, userInstruction, persistInstruction,
  previewPanelOpen, setPreviewPanelOpen, previewUrl, previewMime, previewFileName,
  queue, applyFilePreview,
  resultsPanelOpen, setResultsPanelOpen, lastScanV5, lastScanFileName,
  telemetry, pendingAnalysis, confirmAnalysis, saveToNotebook, savingNotebook,
}: ScanFloatingPanelsProps) {
  return (
    <>
      <OsFloatingPanel
        open={instructionsOpen}
        onClose={() => setInstructionsOpen(false)}
        title={tr("scanner.instructionsTitle", "הנחיות לפענוח")}
      >
        <textarea
          value={userInstruction}
          onChange={(e) => persistInstruction(e.target.value)}
          rows={6}
          className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 text-sm"
          placeholder={tr("scanner.instructionPlaceholder", "לדוגמה: הדגש מע״מ ושורות מע״מ")}
        />
      </OsFloatingPanel>

      <OsFloatingPanel
        open={previewPanelOpen}
        onClose={() => setPreviewPanelOpen(false)}
        title={tr("scanner.preview", "תצוגה מקדימה")}
        panelWidth={640}
        zIndex={OS_MODAL_PANEL_Z + 10}
      >
        <ScanFilePreview
          url={previewUrl}
          mime={previewMime}
          fileName={previewFileName}
          emptyLabel={tr("scanner.noPreview", "אין תצוגה מקדימה לסוג קובץ זה")}
        />
        {previewFileName ? (
          <p className="mt-2 truncate text-center text-[10px] font-bold text-[color:var(--foreground-muted)]">
            {previewFileName}
          </p>
        ) : null}
        {queue.length > 0 ? (
          <ul className="mt-3 space-y-1 border-t border-[color:var(--border-main)] pt-3 text-xs">
            {queue.map((q) => (
              <li key={q.id}>
                <button
                  type="button"
                  onClick={() => applyFilePreview(q.file)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 px-2 py-1.5 text-start transition hover:bg-[color:var(--surface-soft)]"
                >
                  <span className="truncate font-semibold">{q.file.name}</span>
                  <span
                    className={
                      q.status === "done"
                        ? "text-emerald-500"
                        : q.status === "error"
                          ? "text-red-500"
                          : q.status === "processing"
                            ? "text-orange-500"
                            : "text-[color:var(--foreground-muted)]"
                    }
                  >
                    {q.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </OsFloatingPanel>

      <OsFloatingPanel
        open={resultsPanelOpen}
        onClose={() => setResultsPanelOpen(false)}
        title={tr("scanner.resultsPanel", "תוצאות סריקה")}
        panelWidth={560}
        zIndex={OS_MODAL_PANEL_Z + 20}
      >
        {lastScanV5 && lastScanFileName ? (
          <ScanResultsPanel
            v5={lastScanV5}
            fileName={lastScanFileName}
            telemetry={telemetry}
            onConfirmErp={() => pendingAnalysis && void confirmAnalysis()}
            onSaveNotebook={() => void saveToNotebook()}
            savingNotebook={savingNotebook}
          />
        ) : (
          <p className="text-sm text-[color:var(--foreground-muted)]">
            {tr("scanner.noPreview", "אין תוצאה")}
          </p>
        )}
      </OsFloatingPanel>
    </>
  );
}
