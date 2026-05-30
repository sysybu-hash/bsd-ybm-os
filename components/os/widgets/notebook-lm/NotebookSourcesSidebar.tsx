"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, FolderOpen, Loader2, Save, Upload } from "lucide-react";
import { SCAN_ACCEPT_SUMMARY } from "@/lib/scan-mime";
import ItemActions from "@/components/os/ItemActions";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import { toast } from "sonner";
import type { Source, SavedNotebookSummary, ProjectOption } from "./types";

const P = "workspaceWidgets.notebookLM";

type NotebookSourcesSidebarProps = {
  notebookTitle: string;
  setNotebookTitle: (v: string) => void;
  projectId: string;
  setProjectId: (v: string) => void;
  projects: ProjectOption[];
  isSaving: boolean;
  onSave: () => void;
  showSavedPanel: boolean;
  onToggleSavedPanel: () => void;
  onNewNotebook: () => void;
  savedList: SavedNotebookSummary[];
  onLoadNotebook: (id: string) => void;
  onDeleteSaved: (id: string) => void;
  sources: Source[];
  isUploading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  fileAccept: string;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRenameSource: (id: string) => void;
  onRemoveSource: (id: string) => void;
  onKnowledgeVaultSelect: (item: { id: string; name: string; parsedSummary?: unknown }) => void;
  t: (key: string) => string;
};

export function NotebookSourcesSidebar({
  notebookTitle,
  setNotebookTitle,
  projectId,
  setProjectId,
  projects,
  isSaving,
  onSave,
  showSavedPanel,
  onToggleSavedPanel,
  onNewNotebook,
  savedList,
  onLoadNotebook,
  onDeleteSaved,
  sources,
  isUploading,
  fileInputRef,
  fileAccept,
  onFileUpload,
  onRenameSource,
  onRemoveSource,
  onKnowledgeVaultSelect,
  t,
}: NotebookSourcesSidebarProps) {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/50 p-4 md:border-l">
      {/* Title / project / controls */}
      <div className="mb-4 space-y-2">
        <input
          type="text"
          value={notebookTitle}
          onChange={(e) => setNotebookTitle(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-bold text-[color:var(--foreground-main)]"
          aria-label={t(`${P}.titlePlaceholder`)}
          placeholder={t(`${P}.titlePlaceholder`)}
        />
        <select
          value={projectId}
          onChange={(e) => setProjectId(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-xs text-[color:var(--foreground-main)]"
          aria-label={t(`${P}.projectLabel`)}
        >
          <option value="">{t(`${P}.projectNone`)}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onSave}
            className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500 disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            {t(`${P}.save`)}
          </button>
          <button
            type="button"
            onClick={onToggleSavedPanel}
            className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs font-medium text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-card)]"
          >
            <FolderOpen className="h-3 w-3" />
            {t(`${P}.load`)}
          </button>
          <button
            type="button"
            onClick={onNewNotebook}
            className="rounded-lg border border-[color:var(--border-main)] px-3 py-2 text-xs text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-card)]"
          >
            {t(`${P}.newNotebook`)}
          </button>
          <KnowledgeVaultAttachButton onSelect={onKnowledgeVaultSelect} />
        </div>
      </div>

      {/* Saved notebooks panel */}
      <AnimatePresence>
        {showSavedPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4 max-h-40 overflow-y-auto rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-2"
          >
            {savedList.length === 0 ? (
              <p className="p-2 text-center text-xs text-[color:var(--foreground-muted)]">{t(`${P}.noSavedNotebooks`)}</p>
            ) : (
              savedList.map((nb) => (
                <motion.div
                  key={nb.id}
                  className="flex items-center justify-between gap-2 rounded-md p-2 hover:bg-[color:var(--surface-soft)]"
                >
                  <button
                    type="button"
                    className="flex-1 truncate text-start text-xs font-medium text-[color:var(--foreground-main)]"
                    onClick={() => onLoadNotebook(nb.id)}
                  >
                    {nb.title}
                  </button>
                  <ItemActions onDelete={() => onDeleteSaved(nb.id)} deleteLabel={t(`${P}.deleteNotebook`)} />
                </motion.div>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sources heading */}
      <h2 className="mb-4 flex items-center gap-2 text-lg font-bold text-[color:var(--foreground-main)]">
        <FileText className="h-5 w-5 text-indigo-500" /> {t(`${P}.sourcesHeading`)}
      </h2>

      {/* Drop zone */}
      <div
        className={`group relative mb-4 overflow-hidden rounded-xl border-2 border-dashed border-[color:var(--border-main)] p-6 text-center transition ${isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-indigo-500/50 hover:bg-[color:var(--surface-soft)]"}`}
        onClick={() => { if (!isUploading) fileInputRef.current?.click(); }}
      >
        {isUploading ? (
          <Loader2 className="mx-auto mb-2 h-8 w-8 animate-spin text-indigo-500" />
        ) : (
          <Upload className="mx-auto mb-2 h-8 w-8 text-[color:var(--foreground-muted)] group-hover:text-indigo-500" />
        )}
        <p className="text-sm font-medium text-[color:var(--foreground-muted)]">{t(`${P}.uploadHint`)}</p>
        <p className="mt-1 text-[10px] text-[color:var(--foreground-muted)]">{SCAN_ACCEPT_SUMMARY}</p>
        <input
          type="file"
          accept={fileAccept}
          multiple
          className="hidden"
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          onChange={onFileUpload}
        />
      </div>

      {/* Source list */}
      <div className="custom-scrollbar flex-1 min-h-0 space-y-2 overflow-y-auto pr-1">
        <AnimatePresence>
          {sources.map((source) => (
            <motion.div
              key={source.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex items-center justify-between rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div className="rounded-md bg-indigo-500/15 p-2 text-indigo-500">
                  <FileText className="h-4 w-4" />
                </div>
                <span className="truncate text-sm font-medium text-[color:var(--foreground-main)]">{source.name}</span>
              </div>
              <ItemActions onEdit={() => onRenameSource(source.id)} onDelete={() => onRemoveSource(source.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
        {sources.length === 0 && !isUploading && (
          <p className="mt-6 text-center text-sm text-[color:var(--foreground-muted)]">{t(`${P}.noSources`)}</p>
        )}
      </div>
    </div>
  );
}
