"use client";

import React from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import {
  Folder,
  File,
  FileText,
  Image as ImageIcon,
  FileCode,
  CheckSquare,
  Square,
  Loader2,
} from "lucide-react";
import type { DriveDecodeStatus } from "@prisma/client";
import { decodeStatusLabel } from "@/lib/google-drive-decode-routing";
import type { GoogleFile } from "./types";
import type { DriveViewMode } from "@/lib/google-drive-view-mode";

export function getFileIcon(mimeType: string) {
  if (mimeType === "application/vnd.google-apps.folder")
    return <Folder className="text-amber-500" size={20} />;
  if (mimeType.includes("pdf")) return <FileText className="text-rose-500" size={20} />;
  if (mimeType.includes("image")) return <ImageIcon className="text-emerald-500" size={20} />;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel"))
    return <FileText className="text-green-600" size={20} />;
  if (mimeType.includes("presentation") || mimeType.includes("powerpoint"))
    return <FileText className="text-orange-500" size={20} />;
  if (mimeType.includes("javascript") || mimeType.includes("json") || mimeType.includes("html"))
    return <FileCode className="text-blue-500" size={20} />;
  return <File className="text-slate-400" size={20} />;
}

export function statusBadge(status: DriveDecodeStatus | null | undefined) {
  const label = decodeStatusLabel(status);
  const color =
    status === "COMPLETED"
      ? "bg-emerald-500/15 text-emerald-700"
      : status === "FAILED"
        ? "bg-rose-500/15 text-rose-600"
        : status === "PROCESSING"
          ? "bg-amber-500/15 text-amber-700"
          : status === "NEEDS_REVIEW"
            ? "bg-violet-500/15 text-violet-700"
            : "bg-slate-500/10 text-slate-500";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[9px] font-black uppercase ${color}`}>
      {label}
    </span>
  );
}

export function isFile(f: GoogleFile) {
  return f.mimeType !== "application/vnd.google-apps.folder";
}

type FileListProps = {
  files: GoogleFile[];
  viewMode: DriveViewMode;
  selectedIds: Set<string>;
  workspace: { folderId: string; folderName: string } | null;
  driveError: string | null;
  reauthUrl: string | null;
  loading: boolean;
  actionFileId: string | null;
  onFolderClick: (folder: GoogleFile) => void;
  onToggleSelect: (id: string) => void;
  fileActionsSlot: (file: GoogleFile) => React.ReactNode;
};

export function DriveFileList({
  files,
  viewMode,
  selectedIds,
  workspace,
  driveError,
  reauthUrl,
  loading,
  onFolderClick,
  onToggleSelect,
  fileActionsSlot,
}: FileListProps) {
  const { t } = useI18n();
  if (driveError && !loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-4">
        <p className="text-sm font-bold text-rose-500 max-w-md leading-relaxed">{driveError}</p>
        {reauthUrl ? (
          <button
            type="button"
            onClick={() => { window.location.assign(reauthUrl); }}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-black shadow-lg transition-all"
          >
            התחברות מחדש עם Google
          </button>
        ) : null}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center opacity-40">
        <Loader2 size={40} className="text-blue-600 animate-spin mb-4" />
        <p className="text-sm font-bold uppercase tracking-widest">טוען קבצים...</p>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center opacity-40 p-8">
        <div className="w-20 h-20 rounded-full bg-slate-500/10 flex items-center justify-center mb-6">
          <Folder size={40} className="text-slate-400" />
        </div>
        <h3 className="text-lg font-bold mb-2">לא נמצאו קבצים</h3>
        <p className="text-xs text-[color:var(--foreground-muted)] max-w-xs leading-relaxed font-medium">
          העלו קובץ או המתינו לסנכרון מתיקיית {workspace?.folderName ?? "BSD-YBM"} ב-Drive.
        </p>
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 p-4">
        {files.map((file) => (
          <div
            key={file.id}
            className={`group relative rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 hover:shadow-md transition-all cursor-pointer ${
              selectedIds.has(file.id) ? "ring-2 ring-violet-500/40" : ""
            }`}
            onClick={() =>
              file.mimeType === "application/vnd.google-apps.folder"
                ? onFolderClick(file)
                : window.open(file.webViewLink, "_blank")
            }
          >
            {isFile(file) ? (
              <button
                type="button"
                className="absolute top-2 left-2 z-10"
                onClick={(e) => { e.stopPropagation(); onToggleSelect(file.id); }}
              >
                {selectedIds.has(file.id) ? (
                  <CheckSquare size={16} className="text-violet-600" />
                ) : (
                  <Square size={16} className="text-[color:var(--foreground-muted)]" />
                )}
              </button>
            ) : null}
            <div className="flex flex-col items-center text-center gap-2 pt-4">
              <div className="w-12 h-12 rounded-lg bg-[color:var(--background-main)] border border-[color:var(--border-main)] flex items-center justify-center">
                {getFileIcon(file.mimeType)}
              </div>
              <h4 className="text-xs font-bold truncate w-full">{file.name}</h4>
              {isFile(file) ? statusBadge(file.decodeStatus) : null}
            </div>
            <div className="mt-2 flex justify-center">{fileActionsSlot(file)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (viewMode === "details") {
    return (
      <div className="overflow-x-auto custom-scrollbar">
      <table className="w-full min-w-[480px] text-sm">
        <thead className="sticky top-0 bg-[color:var(--background-main)] border-b border-[color:var(--border-main)] text-[10px] uppercase tracking-wider text-[color:var(--foreground-muted)]">
          <tr>
            <th className="p-3 w-10" />
            <th className="p-3 text-start">{t("workspaceWidgets.googleDrive.table.name")}</th>
            <th className="p-3 text-start">{t("workspaceWidgets.googleDrive.table.type")}</th>
            <th className="p-3 text-start">{t("workspaceWidgets.googleDrive.table.status")}</th>
            <th className="p-3 text-start">{t("workspaceWidgets.googleDrive.table.updated")}</th>
            <th className="p-3 w-28" />
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.id}
              className={`border-b border-[color:var(--border-main)] hover:bg-[color:var(--foreground-muted)]/5 cursor-pointer ${
                selectedIds.has(file.id) ? "bg-violet-500/5" : ""
              }`}
              onClick={() =>
                file.mimeType === "application/vnd.google-apps.folder"
                  ? onFolderClick(file)
                  : window.open(file.webViewLink, "_blank")
              }
            >
              <td className="p-3">
                {isFile(file) ? (
                  <button type="button" onClick={(e) => { e.stopPropagation(); onToggleSelect(file.id); }}>
                    {selectedIds.has(file.id) ? (
                      <CheckSquare size={16} className="text-violet-600" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                ) : null}
              </td>
              <td className="p-3 font-bold truncate max-w-[200px]">{file.name}</td>
              <td className="p-3 text-[10px] font-mono text-[color:var(--foreground-muted)]">
                {file.mimeType === "application/vnd.google-apps.folder"
                  ? "תיקייה"
                  : file.mimeType.split("/").pop()}
              </td>
              <td className="p-3">{isFile(file) ? statusBadge(file.decodeStatus) : "—"}</td>
              <td className="p-3 text-[10px] text-[color:var(--foreground-muted)]">
                {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString("he-IL") : "—"}
              </td>
              <td className="p-3">{fileActionsSlot(file)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    );
  }

  // list + compact
  const compact = viewMode === "compact";
  return (
    <div className="divide-y divide-[color:var(--border-main)]">
      {files.map((file) => (
        <div
          key={file.id}
          className={`group flex items-center justify-between hover:bg-[color:var(--foreground-muted)]/5 transition-all cursor-pointer ${
            compact ? "px-3 py-2" : "p-4"
          } ${selectedIds.has(file.id) ? "bg-violet-500/5" : ""}`}
          onClick={() =>
            file.mimeType === "application/vnd.google-apps.folder"
              ? onFolderClick(file)
              : window.open(file.webViewLink, "_blank")
          }
        >
          <div className="flex items-center gap-3 min-w-0">
            {isFile(file) ? (
              <button
                type="button"
                className="shrink-0 p-1"
                onClick={(e) => { e.stopPropagation(); onToggleSelect(file.id); }}
                aria-label={selectedIds.has(file.id) ? "בטל בחירה" : "בחר"}
              >
                {selectedIds.has(file.id) ? (
                  <CheckSquare size={18} className="text-violet-600" />
                ) : (
                  <Square size={18} className="text-[color:var(--foreground-muted)]" />
                )}
              </button>
            ) : (
              <span className="w-[26px]" />
            )}
            <div
              className={`rounded-lg bg-[color:var(--surface-card)] border border-[color:var(--border-main)] flex items-center justify-center shadow-sm ${
                compact ? "w-8 h-8" : "w-10 h-10"
              }`}
            >
              {getFileIcon(file.mimeType)}
            </div>
            <div className="min-w-0">
              <h4
                className={`font-bold truncate group-hover:text-blue-500 transition-colors ${compact ? "text-xs" : "text-sm"}`}
              >
                {file.name}
              </h4>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] text-[color:var(--foreground-muted)] font-mono uppercase tracking-tighter">
                  {file.mimeType === "application/vnd.google-apps.folder"
                    ? "תיקייה"
                    : file.mimeType.split("/").pop()?.toUpperCase()}
                </p>
                {isFile(file) ? statusBadge(file.decodeStatus) : null}
              </div>
            </div>
          </div>
          {fileActionsSlot(file)}
        </div>
      ))}
    </div>
  );
}
