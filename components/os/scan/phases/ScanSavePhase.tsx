"use client";

import React from "react";
import { ScanLine } from "lucide-react";
import { ScanDestinationPicker } from "../shared/ScanDestinationPicker";
import type { UnifiedSaveTarget } from "@/lib/scan/unified-scan-types";

type ScanSavePhaseProps = {
  saveTargets: UnifiedSaveTarget[];
  onSaveTargetsChange: (targets: UnifiedSaveTarget[]) => void;
  hasProject: boolean;
  fileName: string;
  vendor?: string;
  amount?: number;
  tr: (key: string, fallback: string) => string;
  onSave: () => void;
  onNewScan?: () => void;
  saving?: boolean;
};

export function ScanSavePhase({
  saveTargets,
  onSaveTargetsChange,
  hasProject,
  fileName,
  vendor,
  amount,
  tr,
  onSave,
  onNewScan,
  saving,
}: ScanSavePhaseProps) {
  const canSave = saveTargets.length > 0;

  return (
    <div className="w-full min-w-0 max-w-3xl flex flex-col gap-4 p-4">
      <div>
        <h3 className="text-sm font-black text-[color:var(--foreground-main)]">
          {tr("workspaceWidgets.documentScan.savePhaseTitle", "שמירת מסמך")}
        </h3>
        <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">
          {fileName}
          {vendor ? ` · ${vendor}` : ""}
          {typeof amount === "number" ? ` · ₪${amount.toLocaleString("he-IL")}` : ""}
        </p>
      </div>

      <ScanDestinationPicker
        values={saveTargets}
        onChange={onSaveTargetsChange}
        hasProject={hasProject}
        tr={tr}
      />

      <div className="flex flex-wrap gap-2">
        {onNewScan ? (
          <button
            type="button"
            onClick={onNewScan}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm font-bold text-orange-700 transition hover:bg-orange-500/15 dark:text-orange-300"
          >
            <ScanLine size={16} aria-hidden />
            {tr("workspaceWidgets.aiScanner.newScan", "סריקה חדשה")}
          </button>
        ) : null}
        <button
          type="button"
          disabled={saving || !canSave}
          onClick={onSave}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-gradient-to-l from-emerald-600 to-teal-600 px-4 py-2.5 text-sm font-bold text-white shadow-md disabled:opacity-50"
        >
          {saving
            ? tr("workspaceWidgets.documentScan.saving", "שומר…")
            : tr("workspaceWidgets.documentScan.confirmSave", "אשר ושמור")}
        </button>
      </div>
    </div>
  );
}
