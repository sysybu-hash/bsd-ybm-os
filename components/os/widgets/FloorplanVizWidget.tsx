"use client";

import React from "react";
import { Box, Layers, Plus, Upload, View } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useTradeProfile } from "@/components/os/system/TradeProfileProvider";
import FloorplanVizLibrary from "@/components/os/widgets/floorplan-viz/FloorplanVizLibrary";
import FloorplanVizResults from "@/components/os/widgets/floorplan-viz/FloorplanVizResults";
import FloorplanVizStylePicker from "@/components/os/widgets/floorplan-viz/FloorplanVizStylePicker";
import { OsButton } from "@/components/os/ui";
import { useFloorplanVizRun } from "@/components/os/widgets/floorplan-viz/useFloorplanVizRun";

export type FloorplanVizWidgetProps = {
  liveData?: Record<string, unknown> | null;
};

export default function FloorplanVizWidget({ liveData }: FloorplanVizWidgetProps) {
  const { t } = useI18n();
  const { isCompanyMgmt } = useTradeProfile();
  const {
    file,
    setFile,
    onFile,
    projectId,
    setProjectId,
    projects,
    loading,
    error,
    setError,
    result,
    setResult,
    styleId,
    setStyleId,
    customKit,
    setCustomKit,
    scope,
    setScope,
    runs,
    editingKey,
    titleDraft,
    setTitleDraft,
    fileRef,
    generate,
    openRun,
    deleteRun,
    renameRun,
    editStill,
    improveStill,
    rescanStill,
    selectStill,
    deleteStill,
    pendingCount,
  } = useFloorplanVizRun({ liveData, t });


  if (isCompanyMgmt) {
    return (
      <p className="p-6 text-sm text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.floorplanViz.constructionOnly")}
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col" dir="rtl">
      <div className="shrink-0 border-b border-[color:var(--border-main)] px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Box size={16} className="text-violet-600" aria-hidden />
          <div className="min-w-0 flex-1">
            {result?.runId ? (
              <input
                className="w-full rounded-lg border border-transparent bg-transparent px-1 text-sm font-bold hover:border-[color:var(--border-main)] focus:border-[color:var(--border-main)]"
                value={titleDraft}
                aria-label={t("workspaceWidgets.floorplanViz.rename")}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => void renameRun()}
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
            {!result ? (
              <p className="text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.subtitle")}
              </p>
            ) : null}
          </div>
          {projects.length > 0 ? (
            <label className="text-[10px] text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.floorplanViz.project")}
              <select
                className="ms-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px]"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">{t("workspaceWidgets.floorplanViz.noProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,image/*"
            className="hidden"
            onChange={(e) => {
              onFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          <OsButton
            variant="quiet"
            size="sm"
            icon={<Plus size={12} aria-hidden />}
            onClick={() => {
              setResult(null);
              setFile(null);
              setError(null);
            }}
          >
            {t("workspaceWidgets.floorplanViz.newRun")}
          </OsButton>
          <OsButton
            variant="secondary"
            size="sm"
            icon={<Upload size={12} aria-hidden />}
            onClick={() => fileRef.current?.click()}
          >
            {file ? file.name : t("workspaceWidgets.floorplanViz.upload")}
          </OsButton>
          <OsButton
            variant="primary"
            size="sm"
            loading={loading && pendingCount === 0}
            disabled={(!file && !result?.runId) || loading}
            onClick={() => void generate(scope)}
          >
            {scope === "full"
              ? t("workspaceWidgets.floorplanViz.generateFull")
              : t("workspaceWidgets.floorplanViz.generateOverview")}
          </OsButton>
        </div>
      </div>
      <div data-widget-scroll-pane className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4">
        <div className="mb-4 space-y-4">
          <section className="rounded-xl border border-[color:var(--border-main)] p-3">
            <p className="mb-2 text-[11px] font-semibold">{t("workspaceWidgets.floorplanViz.library")}</p>
            <FloorplanVizLibrary
              t={t}
              runs={runs}
              activeRunId={result?.runId}
              disabled={loading}
              onOpen={(id) => void openRun(id)}
              onDelete={(id) => void deleteRun(id)}
            />
          </section>
          <div role="radiogroup" aria-label={t("workspaceWidgets.floorplanViz.scopeLabel")} className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              role="radio"
              aria-checked={scope === "overview"}
              disabled={loading}
              onClick={() => setScope("overview")}
              className={`rounded-xl border px-3 py-2 text-start ${
                scope === "overview"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <View size={14} aria-hidden />
                {t("workspaceWidgets.floorplanViz.scopeOverview")}
              </span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.scopeOverviewHint")}
              </span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={scope === "full"}
              disabled={loading}
              onClick={() => setScope("full")}
              className={`rounded-xl border px-3 py-2 text-start ${
                scope === "full"
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <Layers size={14} aria-hidden />
                {t("workspaceWidgets.floorplanViz.scopeFull")}
              </span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {t("workspaceWidgets.floorplanViz.scopeFullHint")}
              </span>
            </button>
          </div>
          <FloorplanVizStylePicker
            t={t}
            styleId={styleId}
            onStyleId={setStyleId}
            customKit={customKit}
            onCustomKit={setCustomKit}
            disabled={loading}
          />
        </div>
        {!file && !result && !loading ? (
          <p className="py-10 text-center text-sm text-[color:var(--foreground-muted)]">
            {t("workspaceWidgets.floorplanViz.empty")}
          </p>
        ) : (
          <FloorplanVizResults
            t={t}
            loading={loading}
            error={error}
            layout={result?.layout ?? null}
            images={result?.images ?? []}
            enginesUsed={result?.enginesUsed ?? []}
            ocrEngines={result?.ocrEngines ?? []}
            visionEngines={result?.visionEngines ?? []}
            projectId={projectId || undefined}
            projectName={projects.find((p) => p.id === projectId)?.name}
            unitTitle={result?.title}
            sourceFile={file}
            styleKit={result?.styleKit ?? customKit}
            pendingRooms={pendingCount}
            onGenerateRooms={pendingCount > 0 ? () => void generate("rooms") : undefined}
            loadingLabel={
              scope === "full"
                ? t("projectDashboard.vizGenerating")
                : t("workspaceWidgets.floorplanViz.generatingOverview")
            }
            geometry={result?.geometry}
            runId={result?.runId}
            editingKey={editingKey}
            onEditStill={(img, instruction, region) => void editStill(img, instruction, region)}
            onImproveStill={(img, failures) => void improveStill(img, failures)}
            onRescanStill={(img) => void rescanStill(img)}
            onDeleteStill={(img) => void deleteStill(img)}
            onSelectStill={(img) => void selectStill(img)}
          />
        )}
      </div>
    </div>
  );
}
