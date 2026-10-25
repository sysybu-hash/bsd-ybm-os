"use client";

import React, { useEffect, useRef } from "react";
import { Box, Plus } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import { useIsPlatformAdmin } from "@/hooks/use-is-platform-admin";
import FloorplanVizLibrary from "@/components/os/widgets/floorplan-viz/FloorplanVizLibrary";
import FloorplanVizResults from "@/components/os/widgets/floorplan-viz/FloorplanVizResults";
import FloorplanVizPaintContact from "@/components/os/widgets/floorplan-viz/FloorplanVizPaintContact";
import VizStepper from "@/components/os/widgets/floorplan-viz/wizard/VizStepper";
import StepUpload from "@/components/os/widgets/floorplan-viz/wizard/StepUpload";
import StepIdentify from "@/components/os/widgets/floorplan-viz/wizard/StepIdentify";
import StepOptions from "@/components/os/widgets/floorplan-viz/wizard/StepOptions";
import { useVizWizard } from "@/components/os/widgets/floorplan-viz/wizard/useVizWizard";
import { OsButton } from "@/components/os/ui";
import { useFloorplanVizRun } from "@/components/os/widgets/floorplan-viz/useFloorplanVizRun";

export type FloorplanVizWidgetProps = {
  liveData?: Record<string, unknown> | null;
};

/**
 * The visualisation window, in steps: upload a plan, see what it was read as
 * and confirm it, choose the options that fit that structure, produce. Saved
 * runs open straight to their results.
 */
export default function FloorplanVizWidget({ liveData }: FloorplanVizWidgetProps) {
  const { t } = useI18n();
  const { isCompanyMgmt } = useTradeProfile();
  const isPlatformAdmin = useIsPlatformAdmin();
  const run = useFloorplanVizRun({ liveData, t });
  const { file, setFile, dwf, result, setResult, setError, loading } = run;
  const wizard = useVizWizard({ t, prepareDwf: dwf.prepare, dwfStaged: dwf.currentStaged });
  const { identify, step, setStep } = wizard;

  // Opened from the scanner with a sheet: read it as an upload.
  const scannerSheet = useRef<string | null>(null);
  useEffect(() => {
    const key = typeof liveData?.planDataUrl === "string" ? liveData.planDataUrl : "";
    if (!key || !file || scannerSheet.current === key) return;
    scannerSheet.current = key;
    void identify([file]).then((ready) => ready && setFile(ready));
  }, [file, identify, liveData?.planDataUrl, setFile]);

  // A saved run, opened from the library, shows its results.
  useEffect(() => {
    if (result && step !== "result") setStep("result");
  }, [result, setStep, step]);

  if (isCompanyMgmt && !isPlatformAdmin) {
    return <p className="p-6 text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.constructionOnly")}</p>;
  }

  const startOver = () => {
    wizard.reset();
    setResult(null);
    setFile(null);
    dwf.reset();
    setError(null);
  };
  const onFiles = async (files: File[]) => {
    setResult(null);
    setError(null);
    setFile(null);
    const ready = await identify(files);
    if (ready) setFile(ready);
  };

  return (
    <div className="flex h-full min-h-0 flex-col" dir="rtl">
      <div className="shrink-0 space-y-2 border-b border-[color:var(--border-main)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Box size={16} className="text-violet-600" aria-hidden />
          <div className="min-w-0 flex-1">
            {result?.runId ? (
              <input
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-bold hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)]"
                value={run.titleDraft}
                aria-label={t("workspaceWidgets.floorplanViz.rename")}
                onChange={(e) => run.setTitleDraft(e.target.value)}
                onBlur={() => void run.renameRun()}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
            ) : (
              <h2 className="text-sm font-bold">{t("workspaceWidgets.titles.floorplanViz")}</h2>
            )}
          </div>
          {run.projects.length > 0 ? (
            <label className="text-[10px] text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.floorplanViz.project")}
              <select
                className="ms-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={run.projectId}
                onChange={(e) => run.setProjectId(e.target.value)}
              >
                <option value="">{t("workspaceWidgets.floorplanViz.noProject")}</option>
                {run.projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <OsButton variant="quiet" size="sm" icon={<Plus size={12} aria-hidden />} onClick={startOver}>
            {t("workspaceWidgets.floorplanViz.newRun")}
          </OsButton>
        </div>
        <VizStepper t={t} step={step} />
      </div>
      <div data-widget-scroll-pane className="custom-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {run.access?.subscriber === false ? (
          <p className="rounded-xl border border-[color:var(--border-main)] px-4 py-3 text-sm text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.subscriberOnly")}
          </p>
        ) : null}
        {run.access?.subscriber && !run.access.paint ? <FloorplanVizPaintContact t={t} email={run.access.contactEmail} /> : null}
        <details className="rounded-xl border border-[color:var(--border-main)] p-3" open={step === "upload" && run.runs.length > 0}>
          <summary className="cursor-pointer text-[11px] font-semibold">{t("workspaceWidgets.floorplanViz.library")}</summary>
          <div className="mt-2">
            <FloorplanVizLibrary
              t={t}
              runs={run.runs}
              activeRunId={result?.runId}
              disabled={loading}
              onOpen={(id) => void run.openRun(id)}
              onDelete={(id) => void run.deleteRun(id)}
            />
          </div>
        </details>

        {step === "upload" ? (
          <StepUpload t={t} busy={wizard.identifying || dwf.reading} disabled={run.access?.subscriber !== true} onFiles={(f) => void onFiles(f)} />
        ) : null}
        {step === "identify" && wizard.report ? (
          <StepIdentify
            t={t}
            report={wizard.report}
            structure={wizard.structure}
            onStructure={wizard.setStructure}
            planId={wizard.planId}
            onPlan={wizard.setPlanId}
            canContinue={wizard.canContinue}
            onContinue={() => setStep("options")}
            onBack={startOver}
          />
        ) : null}
        {step === "options" && wizard.structure ? (
          <StepOptions
            t={t}
            structure={wizard.structure}
            access={run.access}
            loading={loading}
            scope={run.scope}
            onScope={run.setScope}
            styleId={run.styleId}
            onStyleId={run.setStyleId}
            customKit={run.customKit}
            onCustomKit={run.setCustomKit}
            files={wizard.files}
            dwf={dwf}
            projectId={run.projectId || undefined}
            onGenerate={(mode) => {
              setStep("result");
              void run.generate(run.scope, mode, wizard.runFields());
            }}
            onBack={() => setStep("identify")}
          />
        ) : null}
        {step === "result" ? (
          <FloorplanVizResults
            t={t}
            loading={loading}
            error={run.error}
            layout={result?.layout ?? null}
            images={result?.images ?? []}
            enginesUsed={result?.enginesUsed ?? []}
            ocrEngines={result?.ocrEngines ?? []}
            visionEngines={result?.visionEngines ?? []}
            projectId={run.projectId || undefined}
            projectName={run.projects.find((p) => p.id === run.projectId)?.name}
            unitTitle={result?.title}
            sourceFile={file}
            styleKit={result?.styleKit ?? run.customKit}
            pendingRooms={run.pendingCount}
            onGenerateRooms={run.pendingCount > 0 ? () => void run.generate("rooms") : undefined}
            loadingLabel={run.scope === "full" ? t("projectDashboard.vizGenerating") : t("workspaceWidgets.floorplanViz.generatingOverview")}
            geometry={result?.geometry}
            runId={result?.runId}
            editingKey={run.editingKey}
            onEditStill={run.access?.paint ? (img, instruction, region) => void run.editStill(img, instruction, region) : undefined}
            onImproveStill={run.access?.paint ? (img, failures) => void run.improveStill(img, failures) : undefined}
            onRescanStill={run.access?.paint ? (img) => void run.rescanStill(img) : undefined}
            onDeleteStill={(img) => void run.deleteStill(img)}
            onSelectStill={(img) => void run.selectStill(img)}
            onDismissIssue={(img, issue, dismissed) => void run.dismissIssue(img, issue, dismissed)}
            onSaveRooms={run.saveRooms}
            onAuditSaved={() => {
              if (result?.runId) void run.openRun(result.runId);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
