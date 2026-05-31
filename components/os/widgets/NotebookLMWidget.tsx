"use client";

import { useI18n } from "@/components/os/system/I18nProvider";
import React from "react";
import { toast } from "sonner";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";
import OsPromptDialog from "@/components/os/OsPromptDialog";
import WidgetSplitPanels from "@/components/os/layout/WidgetSplitPanels";
import type { NotebookLMWidgetProps } from "./notebook-lm/types";
import { useNotebookLM } from "./notebook-lm/useNotebookLM";
import { NotebookSourcesSidebar } from "./notebook-lm/NotebookSourcesSidebar";
import { NotebookChatPanel } from "./notebook-lm/NotebookChatPanel";

export default function NotebookLMWidget({
  liveData = null,
  openWorkspaceWidget,
}: NotebookLMWidgetProps) {
  const { dir, t } = useI18n();

  const nb = useNotebookLM({ liveData, t });

  const sourcesSidebar = (
    <NotebookSourcesSidebar
      notebookTitle={nb.notebookTitle}
      setNotebookTitle={nb.setNotebookTitle}
      projectId={nb.projectId}
      setProjectId={nb.setProjectId}
      projects={nb.projects}
      isSaving={nb.isSaving}
      onSave={() => void nb.handleSave()}
      showSavedPanel={nb.showSavedPanel}
      onToggleSavedPanel={() => {
        nb.setShowSavedPanel((v) => !v);
        void nb.refreshSavedList();
      }}
      onNewNotebook={nb.handleNewNotebook}
      savedList={nb.savedList}
      onLoadNotebook={(id) => void nb.handleLoadNotebook(id)}
      onDeleteSaved={nb.handleDeleteSaved}
      sources={nb.sources}
      isUploading={nb.isUploading}
      fileInputRef={nb.fileInputRef}
      fileAccept={nb.fileAccept}
      onFileUpload={(e) => void nb.handleFileUpload(e)}
      onRenameSource={nb.renameSource}
      onRemoveSource={nb.removeSource}
      t={t}
      onKnowledgeVaultSelect={(item) => {
        const text =
          item.parsedSummary && typeof item.parsedSummary === "object"
            ? String((item.parsedSummary as { textPreview?: string }).textPreview ?? "")
            : "";
        if (text.trim()) {
          nb.setSources((prev) => [
            ...prev,
            { id: `vault-${item.id}`, name: item.name, content: text.slice(0, 12000), type: "text" },
          ]);
        }
        toast.success(item.name);
      }}
    />
  );

  const chatPanel = (
    <NotebookChatPanel
      messages={nb.messages}
      isLoading={nb.isLoading}
      input={nb.input}
      setInput={nb.setInput}
      onSubmit={(e) => void nb.handleSubmit(e)}
      onQuickAction={nb.handleQuickAction}
      audioScript={nb.audioScript}
      isPlaying={nb.isPlaying}
      isPaused={nb.isPaused}
      progress={nb.progress}
      speechSettings={nb.speechSettings}
      setSpeechSettings={nb.setSpeechSettings}
      onPlay={nb.playSpeech}
      onPause={nb.pauseSpeech}
      onResume={nb.resumeSpeech}
      onStop={nb.stopSpeech}
      isGeneratingAudio={nb.isGeneratingAudio}
      onVoiceOverview={() => void nb.handleVoiceOverview()}
      issuePromptOpen={nb.issuePromptOpen}
      setIssuePromptOpen={nb.setIssuePromptOpen}
      isIssuingDocument={nb.isIssuingDocument}
      issuedDocumentText={nb.issuedDocumentText}
      onDownloadIssued={nb.downloadIssuedDocument}
      openWorkspaceWidget={openWorkspaceWidget}
      t={t}
    />
  );

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/90 font-sans backdrop-blur-xl"
      dir={dir}
    >
      {/* Dialogs render as portals — unaffected by split layout */}
      <OsPromptDialog
        open={nb.renameSourceId !== null}
        title={t("notebook.renameSourceTitle")}
        defaultValue={nb.renameSourceDefault}
        onConfirm={nb.confirmRenameSource}
        onCancel={() => nb.setRenameSourceId(null)}
      />
      <OsPromptDialog
        open={nb.issuePromptOpen}
        title={t("workspaceWidgets.notebookLM.issueDocumentTitle")}
        label={t("workspaceWidgets.notebookLM.issueDocumentHint")}
        defaultValue=""
        confirmLabel={t("workspaceWidgets.notebookLM.issueDocumentConfirm")}
        onConfirm={(req) => void nb.handleIssueDocument(req)}
        onCancel={() => nb.setIssuePromptOpen(false)}
      />
      <OsConfirmDialog
        open={nb.deleteNotebookId !== null}
        title={t("notebook.deleteNotebookTitle")}
        message={t("notebook.deleteNotebookMessage")}
        destructive
        onConfirm={() => void nb.confirmDeleteSaved()}
        onCancel={() => nb.setDeleteNotebookId(null)}
      />

      {/* ── מובייל: sources בגובה טבעי מלא → גלילה חיצונית, ── */}
      {/* ── דסקטופ: split panels כרגיל                     ── */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">
        {/* sources sidebar — גובה טבעי (לא panel מוגבל) */}
        <div className="shrink-0 border-b border-[color:var(--border-main)]">
          {sourcesSidebar}
        </div>
        {/* chat panel — min-height סביר */}
        <div className="min-h-[55vh]">
          {chatPanel}
        </div>
      </div>
      <WidgetSplitPanels
        className="hidden min-h-0 flex-1 md:flex"
        direction="horizontal"
        panels={[
          { id: "notebook-sources", defaultSize: 33, minSize: 20, children: sourcesSidebar },
          { id: "notebook-chat",    defaultSize: 67, minSize: 40, children: chatPanel },
        ]}
      />
    </div>
  );
}
