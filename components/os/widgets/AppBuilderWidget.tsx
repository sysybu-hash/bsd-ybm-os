"use client";

import { useMemo } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import DynamicRenderer from "@/components/AppBuilder/DynamicRenderer";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import { DynamicSandpackRenderer } from "@/components/os/widgets/shared/DynamicSandpackRenderer";
import { PreviewToolbar } from "@/components/os/widgets/app-builder/PreviewToolbar";
import { SavedAppsPanel } from "@/components/os/widgets/app-builder/SavedAppsPanel";
import { SaveAppForm } from "@/components/os/widgets/app-builder/SaveAppForm";
import AppBuilderAssistantPanel from "@/components/os/widgets/app-builder/AppBuilderAssistantPanel";
import { buildSandpackPlaceholder } from "@/components/os/widgets/app-builder/app-builder-helpers";
import { useAppBuilder } from "@/components/os/widgets/app-builder/useAppBuilder";

type AppBuilderWidgetProps = {
  /** When rendered inside AI Hub — uses hub scroll/fill contract instead of own sticky chrome. */
  embeddedInHub?: boolean;
};

export default function AppBuilderWidget({ embeddedInHub = false }: AppBuilderWidgetProps) {
  const s = useAppBuilder();
  const {
    t, dir, prefix,
    appName, setAppName, appDescription, setAppDescription,
    uiSchema, savedSchemaId, savedApps, loadingSaved, loadingSchemaId,
    deletingSchemaId, saving, shareIdea, setShareIdea, error, success,
    readOnlyLoaded, previewVersion, codeHistory, generatedCode,
    mobilePane, setMobilePane, regenerating, sharingIdea, isEditing,
    refreshSavedApps, applyCodeFromAssistant, handleUndo, handleRedo,
    applySchemaFromAssistant, handleUseTemplate, handleNewApp, handleRegenerate,
    handleShareNow, handleLoadSaved, handleDeleteSaved, handleSaveSchema, formatDate,
  } = s;

  const placeholderCode = useMemo(
    () => buildSandpackPlaceholder(t(`${prefix}.previewWindowTitle`), t(`${prefix}.emptyPreview`)),
    [prefix, t],
  );

  const previewTitle =
    appName.trim() ||
    (uiSchema && "title" in uiSchema && typeof uiSchema.title === "string" ? uiSchema.title : "") ||
    t(`${prefix}.previewWindowTitle`);
  const previewSubtitle = uiSchema ? null : t(`${prefix}.emptyPreview`);

  const buildContent = (
    <>
      <SavedAppsPanel
        savedApps={savedApps}
        loadingSaved={loadingSaved}
        savedSchemaId={savedSchemaId}
        loadingSchemaId={loadingSchemaId}
        deletingSchemaId={deletingSchemaId}
        onNewApp={handleNewApp}
        onRefresh={() => void refreshSavedApps()}
        onUseTemplate={(id) => void handleUseTemplate(id)}
        onLoadSaved={(id) => void handleLoadSaved(id)}
        onDeleteSaved={(app) => void handleDeleteSaved(app)}
        formatDate={formatDate}
      />

      <AppBuilderAssistantPanel
        embedded
        currentUiSchema={uiSchema}
        onSchemaApplied={applySchemaFromAssistant}
        onCodeApplied={applyCodeFromAssistant}
        onRegeneratePreview={(schema) => void handleRegenerate(schema, appName)}
      />

      {uiSchema ? (
        <SaveAppForm
          appName={appName}
          appDescription={appDescription}
          isEditing={isEditing}
          readOnlyLoaded={readOnlyLoaded}
          shareIdea={shareIdea}
          sharingIdea={sharingIdea}
          saving={saving}
          onNameChange={setAppName}
          onDescriptionChange={setAppDescription}
          onShareIdeaChange={setShareIdea}
          onShareNow={() => void handleShareNow()}
          onSave={() => void handleSaveSchema()}
        />
      ) : null}

      {success ? <p className="text-xs text-emerald-400" role="status">{success}</p> : null}
      {error ? <p className="text-xs text-red-400" role="alert">{error}</p> : null}
    </>
  );

  const previewHeader = (
    <PreviewToolbar
      title={previewTitle}
      subtitle={previewSubtitle}
      canUndo={codeHistory.canUndo}
      canRedo={codeHistory.canRedo}
      index={codeHistory.index}
      total={codeHistory.total}
      onUndo={handleUndo}
      onRedo={handleRedo}
    />
  );

  const previewCanvas = (
    <div className="relative min-h-0 flex-1 p-2 sm:p-3">
      {generatedCode ? (
        <DynamicSandpackRenderer
          key={`sandbox-${previewVersion}`}
          code={generatedCode}
          className="absolute inset-2 sm:inset-3"
        />
      ) : uiSchema ? (
        <div className="absolute inset-2 sm:inset-3 overflow-y-auto overscroll-y-contain custom-scrollbar rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]">
          {regenerating ? (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
              <Loader2 size={28} className="animate-spin text-indigo-400" />
              <p className="text-sm font-medium text-[color:var(--foreground-muted)]">{t(`${prefix}.generating`)}</p>
            </div>
          ) : (
            <>
              <DynamicRenderer
                key={`schema-${previewVersion}-${savedSchemaId ?? "draft"}`}
                uiSchema={uiSchema}
                schemaId={savedSchemaId}
                readOnly={readOnlyLoaded}
              />
              <div className="sticky bottom-0 border-t border-[color:var(--border-main)] bg-[color:var(--background-main)]/95 p-3 backdrop-blur-sm">
                <button
                  type="button"
                  onClick={() => void handleRegenerate(uiSchema, appName)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[color:var(--accent)] px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
                >
                  <RefreshCw size={14} />
                  {t(`${prefix}.generate`)}
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <DynamicSandpackRenderer
          key="sandbox-placeholder"
          code={placeholderCode}
          className="absolute inset-2 sm:inset-3"
        />
      )}
    </div>
  );

  const previewPane = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[color:var(--surface-soft)]/40">
      {previewHeader}
      {previewCanvas}
    </div>
  );

  const controlsPane = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border-s border-border-main bg-[color:var(--background-main)]">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain custom-scrollbar px-4 py-4 sm:px-5 sm:py-5">
        {buildContent}
      </div>
    </div>
  );

  const mobilePaneSwitcher = (
    <div
      className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 p-2"
      role="tablist"
      aria-label={t(`${prefix}.mobilePaneAria`)}
    >
      {(["build", "preview"] as const).map((pane) => {
        const selected = mobilePane === pane;
        const label = pane === "build" ? t(`${prefix}.mobilePaneBuild`) : t(`${prefix}.mobilePanePreview`);
        return (
          <button
            key={pane}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold transition ${
              selected ? "bg-[color:var(--accent)] text-white" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      data-widget-sticky-chrome={embeddedInHub ? undefined : true}
      data-embedded-in-hub={embeddedInHub ? "true" : undefined}
      data-hub-inner-scroll={embeddedInHub ? "true" : undefined}
      data-app-builder-root
      data-widget-fill-height
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden bg-surface-bg"
      dir={dir}
    >
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {mobilePaneSwitcher}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {mobilePane === "build" ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-y-contain custom-scrollbar px-4 py-4">
              {buildContent}
            </div>
          ) : (
            previewPane
          )}
        </div>
      </div>

      <WidgetSplitPanels
        className="hidden min-h-0 flex-1 md:flex"
        layoutStorageKey="app-builder-split-v1"
        panels={[
          {
            id: "app-builder-controls",
            defaultSize: 36,
            minSize: 28,
            maxSize: 48,
            className: "flex min-h-0 min-w-0 flex-col",
            children: controlsPane,
          },
          {
            id: "app-builder-preview",
            defaultSize: 64,
            minSize: 40,
            className: "flex min-h-0 min-w-0 flex-col",
            children: previewPane,
          },
        ]}
      />
    </div>
  );
}
