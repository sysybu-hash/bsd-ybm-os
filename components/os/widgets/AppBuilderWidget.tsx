"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { DynamicSandpackRenderer } from "@/components/os/widgets/shared/DynamicSandpackRenderer";
import { PreviewToolbar } from "@/components/os/widgets/app-builder/PreviewToolbar";
import { SavedAppsPanel } from "@/components/os/widgets/app-builder/SavedAppsPanel";
import { SaveAppForm } from "@/components/os/widgets/app-builder/SaveAppForm";
import AppBuilderAssistantPanel from "@/components/os/widgets/app-builder/AppBuilderAssistantPanel";
import { SANDPACK_PLACEHOLDER } from "@/components/os/widgets/app-builder/app-builder-helpers";
import { useAppBuilder } from "@/components/os/widgets/app-builder/useAppBuilder";

export default function AppBuilderWidget() {
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

  // ── Raw content fragments — no wrapper divs, no scroll containers ────────
  // Each pane's scroll container is defined ONCE in the return below.
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

      {/* Chat — embedded (flat) mode: grows naturally, no internal scroll */}
      <AppBuilderAssistantPanel
        embedded
        currentUiSchema={uiSchema}
        onSchemaApplied={applySchemaFromAssistant}
        onCodeApplied={applyCodeFromAssistant}
      />

      {/* Save form */}
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
      {error   ? <p className="text-xs text-red-400"     role="alert">{error}</p>    : null}
    </>
  );

  // Undo/redo toolbar — lets the user revert a generation that made things worse.
  const previewToolbar = codeHistory.total > 0 ? (
    <PreviewToolbar
      canUndo={codeHistory.canUndo}
      canRedo={codeHistory.canRedo}
      index={codeHistory.index}
      total={codeHistory.total}
      onUndo={handleUndo}
      onRedo={handleRedo}
    />
  ) : null;

  // When app loaded but no jsxCode — show a "rebuild preview" prompt
  const noCodeCanvas = uiSchema && !generatedCode ? (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] text-center">
      {regenerating ? (
        <>
          <Loader2 size={28} className="animate-spin text-indigo-400" />
          <p className="text-sm font-medium text-[color:var(--foreground-muted)]">בונה תצוגה מקדימה…</p>
        </>
      ) : (
        <>
          <RefreshCw size={28} className="text-indigo-400" />
          <div>
            <p className="text-sm font-semibold text-[color:var(--foreground-main)]">{appName || "האפליקציה נטענה"}</p>
            <p className="mt-1 text-xs text-[color:var(--foreground-muted)]">הקוד לא נשמר — יש לבנות תצוגה מקדימה</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRegenerate(uiSchema, appName)}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-500"
          >
            <RefreshCw size={14} />
            בנה תצוגה מקדימה
          </button>
        </>
      )}
    </div>
  ) : null;

  // previewContent is used only on mobile (build/preview toggle)
  const previewContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {previewToolbar}
      <div className="relative min-h-0 flex-1">
        {noCodeCanvas ?? (
          <DynamicSandpackRenderer
            key={`sandbox-mobile-${previewVersion}`}
            code={generatedCode ?? SANDPACK_PLACEHOLDER}
            className="absolute inset-0"
          />
        )}
      </div>
    </div>
  );

  const mobilePaneSwitcher = (
    <div className="flex shrink-0 gap-1 border-b border-[color:var(--border-main)] bg-[color:var(--background-main)]/90 p-2"
      role="tablist" aria-label={t(`${prefix}.mobilePaneAria`)}>
      {(["build", "preview"] as const).map((pane) => {
        const selected = mobilePane === pane;
        const label = pane === "build" ? t(`${prefix}.mobilePaneBuild`) : t(`${prefix}.mobilePanePreview`);
        return (
          <button key={pane} type="button" role="tab" aria-selected={selected}
            onClick={() => setMobilePane(pane)}
            className={`min-h-[44px] flex-1 rounded-lg px-3 text-sm font-bold transition ${selected ? "bg-indigo-600 text-white" : "bg-[color:var(--surface-soft)] text-[color:var(--foreground-muted)]"}`}>
            {label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      data-widget-sticky-chrome
      data-app-builder-root
      className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-row overflow-hidden bg-surface-bg"
      dir={dir}
    >

      {/* RIGHT PANE (Builder / Chat): Fixed width on desktop, hidden on mobile */}
      <div className="hidden md:flex flex-col w-[350px] shrink-0 h-full min-h-0 border-s border-border-main">
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-4">
          {buildContent}
        </div>
      </div>

      {/* LEFT PANE (Preview): Takes remaining space — NO extra scroll wrapper,
          Sandpack owns its own iframe scroll context */}
      <div className="flex flex-col flex-1 min-w-0 h-full min-h-0 relative">
        {/* Mobile: pane switcher */}
        <div className="shrink-0 md:hidden">{mobilePaneSwitcher}</div>

        {/* Mobile content area (scrollable for build list, flex for preview) */}
        <div data-widget-scroll-pane className="flex-1 min-h-0 md:hidden overflow-y-auto custom-scrollbar p-2">
          {mobilePane === "build" ? buildContent : previewContent}
        </div>

        {/* Desktop: toolbar + preview fill remaining height */}
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden md:flex">
          {previewToolbar}
          <div className="relative min-h-0 flex-1 p-2">
            {noCodeCanvas ?? (
              <DynamicSandpackRenderer
                key={`sandbox-${previewVersion}`}
                code={generatedCode ?? SANDPACK_PLACEHOLDER}
                className="absolute inset-0"
              />
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
