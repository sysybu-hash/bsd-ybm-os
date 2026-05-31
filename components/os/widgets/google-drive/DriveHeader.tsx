"use client";

import React from "react";
import { HardDrive, ChevronLeft, RefreshCw, Upload, Loader2 } from "lucide-react";
import KnowledgeVaultAttachButton from "@/components/os/knowledge-vault/KnowledgeVaultAttachButton";
import { toast } from "sonner";
type DriveHeaderProps = {
  t: (key: string) => string;
  drivePrefix: string;
  boundProjectName?: string | null;
  boundProjectId: string;
  orgBrowseMode: boolean;
  folderPath: { id: string; name: string }[];
  loading: boolean;
  syncing: boolean;
  uploading: boolean;
  driveError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  setOrgBrowseMode: (v: boolean) => void;
  loadProjectsList: () => void;
  handleClearProject: () => void;
  handleRefresh: () => void;
  handleUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  navigateToFolder: (index: number) => void;
};

export function DriveHeader({
  t, drivePrefix, boundProjectName, boundProjectId, orgBrowseMode,
  folderPath, loading, syncing, uploading, driveError,
  fileInputRef, setOrgBrowseMode, loadProjectsList, handleClearProject,
  handleRefresh, handleUpload, navigateToFolder,
}: DriveHeaderProps) {
  return (
    <div className="p-3 md:p-4 border-b border-[color:var(--border-main)] flex flex-wrap items-center justify-between gap-2 bg-[color:var(--background-main)]/50 backdrop-blur-md sticky top-0 z-10">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
          <HardDrive size={20} />
        </div>
        <div className="min-w-0">
          <h3 className="font-black text-sm uppercase tracking-widest truncate">
            {boundProjectName && !orgBrowseMode ? boundProjectName : "Google Drive"}
          </h3>
          <div className="flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)] font-bold overflow-hidden">
            {folderPath.map((folder, i) => (
              <React.Fragment key={folder.id}>
                <button
                  type="button"
                  onClick={() => navigateToFolder(i)}
                  className="hover:text-[color:var(--foreground-main)] transition-colors truncate max-w-[8rem]"
                >
                  {folder.name}
                </button>
                {i < folderPath.length - 1 && <ChevronLeft size={10} className="shrink-0" />}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {boundProjectId && !orgBrowseMode ? (
          <button
            type="button"
            onClick={handleClearProject}
            className="rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            {t(`${drivePrefix}.switchProject`)}
          </button>
        ) : orgBrowseMode ? (
          <button
            type="button"
            onClick={() => { setOrgBrowseMode(false); void loadProjectsList(); }}
            className="rounded-lg border border-[color:var(--border-main)] px-2 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-elevated)]"
          >
            {t(`${drivePrefix}.pickProjectTitle`)}
          </button>
        ) : null}
        <KnowledgeVaultAttachButton
          onSelect={(item) => {
            if (item.webViewLink) window.open(item.webViewLink, "_blank", "noopener,noreferrer");
            else toast.success(item.name);
          }}
        />
        <button
          type="button"
          onClick={() => void handleRefresh()}
          className="p-2 hover:bg-[color:var(--foreground-muted)]/10 rounded-lg text-[color:var(--foreground-muted)] transition-all"
          title="רענון וסנכרון"
        >
          <RefreshCw size={18} className={loading || syncing ? "animate-spin" : ""} />
        </button>
        <input
          ref={fileInputRef as React.RefObject<HTMLInputElement>}
          type="file"
          className="hidden"
          onChange={(e) => void handleUpload(e)}
        />
        <button
          type="button"
          disabled={uploading || Boolean(driveError)}
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-black shadow-lg shadow-blue-900/20 transition-all"
        >
          {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
          <span>העלה קובץ</span>
        </button>
      </div>
    </div>
  );
}
