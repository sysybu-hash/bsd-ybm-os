"use client";

import React, { useRef } from "react";
import { Loader2, Download, Upload, Ruler, Sparkles, Trash2 } from "lucide-react";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import BoqAgentPanel from "@/components/os/widgets/project/BoqAgentPanel";
import TakeoffModule from "@/components/os/widgets/project/TakeoffModule";
import { useBoqPanelState, type BoqSubTab } from "./boq/useBoqPanelState";
import { BoqLinesTable } from "./boq/BoqLinesTable";

export default function ProjectBoqPanel({
  projectId: _projectId,
  apiBase,
  milestonesSection,
}: {
  projectId: string;
  apiBase: string;
  milestonesSection?: React.ReactNode;
}) {
  const s = useBoqPanelState(apiBase);
  const {
    t,
    subTab,
    setSubTab,
    lines,
    loading,
    loadError,
    showTakeoff,
    setShowTakeoff,
    savingTakeoff,
    generatingGantt,
    confirmClear,
    setConfirmClear,
    load,
    onImport,
    exportExcel,
    patchLine,
    editCell,
    deleteLine,
    clearAllLines,
    saveTakeoffMeasurement,
    generateGantt,
  } = s;
  const fileRef = useRef<HTMLInputElement>(null);

  const subTabs: { id: BoqSubTab; label: string }[] = [
    { id: "quote", label: "הצעת מחיר" },
    { id: "boq", label: "כתב כמויות" },
    { id: "bills", label: "חשבונות חלקיים" },
    { id: "milestones", label: "אבני דרך" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1">
        {subTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSubTab(tab.id)}
            className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
              subTab === tab.id
                ? "bg-amber-500/20 text-amber-700 dark:text-amber-200"
                : "border border-[color:var(--border-main)] text-[color:var(--foreground-muted)]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
        >
          <Upload size={12} />
          ייבוא Excel
        </button>
        <button
          type="button"
          onClick={() => exportExcel(subTab === "quote" ? "quote" : "account")}
          className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2 py-1 text-xs"
        >
          <Download size={12} />
          ייצוא Excel
        </button>
        {subTab === "boq" ? (
          <button
            type="button"
            onClick={() => setShowTakeoff(!showTakeoff)}
            className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${
              showTakeoff
                ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200"
                : "border-[color:var(--border-main)]"
            }`}
          >
            <Ruler size={12} />
            {t("workspaceWidgets.takeoff.openTool")}
          </button>
        ) : null}
        {subTab === "boq" ? (
          <button
            type="button"
            onClick={() => void generateGantt()}
            disabled={generatingGantt || lines.length === 0}
            title={lines.length === 0 ? t("workspaceWidgets.ganttAgent.emptyHint") : ""}
            className="flex items-center gap-1 rounded-lg border border-violet-500/60 bg-violet-500/15 px-2 py-1 text-xs font-bold text-violet-700 dark:text-violet-200 disabled:opacity-50"
          >
            {generatingGantt ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Sparkles size={12} />
            )}
            {t("workspaceWidgets.ganttAgent.generate")}
          </button>
        ) : null}
        {subTab === "boq" && lines.length > 0 ? (
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            className="flex items-center gap-1 rounded-lg border border-rose-500/50 px-2 py-1 text-xs font-bold text-rose-700 dark:text-rose-400 hover:bg-rose-500/10"
          >
            <Trash2 size={12} />
            {t("workspaceWidgets.projectBoq.clearAll")}
          </button>
        ) : null}
      </div>

      {subTab === "boq" && showTakeoff ? (
        <div className="h-[60vh] min-h-[420px]">
          <TakeoffModule onSaveMeasurement={saveTakeoffMeasurement} saving={savingTakeoff} />
        </div>
      ) : null}

      {subTab === "milestones" ? (
        milestonesSection ?? (
          <p className="text-xs text-[color:var(--foreground-muted)]">אין נתוני אבני דרך.</p>
        )
      ) : loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="animate-spin text-amber-500" size={20} />
        </div>
      ) : loadError ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-700 dark:text-rose-200">
          {loadError}
        </p>
      ) : subTab === "boq" ? (
        <>
          <div className="max-h-[40vh] min-h-0 overflow-y-auto rounded-lg border border-[color:var(--border-main)]/50">
            <BoqAgentPanel apiBase={apiBase} onApplied={() => void load()} />
          </div>
          {lines.length === 0 ? (
            <p className="text-xs text-[color:var(--foreground-muted)]">
              {t("projectDashboard.boqEmptyImport")}
            </p>
          ) : (
            <BoqLinesTable
              lines={lines}
              editCell={editCell}
              patchLine={patchLine}
              deleteLine={deleteLine}
              t={t}
            />
          )}
        </>
      ) : lines.length === 0 ? (
        <p className="text-xs text-[color:var(--foreground-muted)]">
          {t("projectDashboard.boqEmptyImport")}
        </p>
      ) : (
        <BoqLinesTable
          lines={lines}
          editCell={editCell}
          patchLine={patchLine}
          deleteLine={deleteLine}
          t={t}
        />
      )}

      <OsConfirmDialog
        open={confirmClear}
        title={t("workspaceWidgets.projectBoq.clearAll")}
        message={t("workspaceWidgets.projectBoq.clearAllConfirm")}
        confirmLabel={t("workspaceWidgets.projectBoq.clearAll")}
        destructive
        onConfirm={() => void clearAllLines()}
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
