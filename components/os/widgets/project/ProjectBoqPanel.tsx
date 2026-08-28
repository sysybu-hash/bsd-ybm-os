"use client";

import React, { useRef } from "react";
import { Download, Upload, Ruler, Sparkles, Trash2 } from "lucide-react";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import WidgetState from "@/components/os/WidgetState";
import { OsButton } from "@/components/os/ui";
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
    editPhaseCoefficient,
    deleteLine,
    clearAllLines,
    saveTakeoffMeasurement,
    generateGantt,
  } = s;
  const fileRef = useRef<HTMLInputElement>(null);

  const subTabs: { id: BoqSubTab; labelKey: string }[] = [
    { id: "quote", labelKey: "projectDashboard.tabQuote" },
    { id: "boq", labelKey: "projectDashboard.tabBoq" },
    { id: "bills", labelKey: "projectDashboard.tabBills" },
    { id: "milestones", labelKey: "projectDashboard.tabMilestones" },
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
            {t(tab.labelKey)}
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
        <OsButton variant="secondary" size="sm" icon={<Upload size={12} aria-hidden />} onClick={() => fileRef.current?.click()}>
          {t("projectDashboard.importExcel")}
        </OsButton>
        <OsButton
          variant="secondary"
          size="sm"
          icon={<Download size={12} aria-hidden />}
          onClick={() => exportExcel(subTab === "quote" ? "quote" : "account")}
        >
          {t("projectDashboard.exportExcel")}
        </OsButton>
        {subTab === "boq" ? (
          <OsButton
            variant="secondary"
            size="sm"
            className={showTakeoff ? "border-indigo-500 bg-indigo-500/15 text-indigo-700 dark:text-indigo-200" : ""}
            icon={<Ruler size={12} aria-hidden />}
            onClick={() => setShowTakeoff(!showTakeoff)}
          >
            {t("workspaceWidgets.takeoff.openTool")}
          </OsButton>
        ) : null}
        {subTab === "boq" ? (
          <OsButton
            variant="secondary"
            size="sm"
            className="border-violet-500/60 bg-violet-500/15 text-violet-700 dark:text-violet-200"
            disabled={generatingGantt || lines.length === 0}
            loading={generatingGantt}
            icon={<Sparkles size={12} aria-hidden />}
            title={lines.length === 0 ? t("workspaceWidgets.ganttAgent.emptyHint") : ""}
            onClick={() => void generateGantt()}
          >
            {t("workspaceWidgets.ganttAgent.generate")}
          </OsButton>
        ) : null}
        {subTab === "boq" && lines.length > 0 ? (
          <OsButton
            variant="danger"
            size="sm"
            icon={<Trash2 size={12} aria-hidden />}
            onClick={() => setConfirmClear(true)}
          >
            {t("workspaceWidgets.projectBoq.clearAll")}
          </OsButton>
        ) : null}
      </div>

      {subTab === "boq" && showTakeoff ? (
        <div className="h-[60vh] min-h-[420px]">
          <TakeoffModule onSaveMeasurement={saveTakeoffMeasurement} saving={savingTakeoff} />
        </div>
      ) : null}

      {subTab === "milestones" ? (
        milestonesSection ?? (
          <p className="text-xs text-[color:var(--foreground-muted)]">{t("projectDashboard.noMilestones")}</p>
        )
      ) : loading ? (
        <WidgetState variant="loading" />
      ) : loadError ? (
        <WidgetState variant="error" message={loadError} onRetry={() => void load()} retryLabel={t("common.retry")} />
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
              editPhaseCoefficient={editPhaseCoefficient}
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
          editPhaseCoefficient={editPhaseCoefficient}
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
