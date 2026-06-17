"use client";

import { Download, Eye, RotateCcw, Trash2 } from "lucide-react";
import type { ErpArchiveFile } from "./types";

type Props = {
  file: ErpArchiveFile;
  archiveView: string;
  className: string;
  style?: React.CSSProperties;
  dir: string;
  onPreview: (f: ErpArchiveFile) => void;
  onDownload: (f: ErpArchiveFile) => Promise<void>;
  onDelete: (f: ErpArchiveFile) => void;
  onRestore: (f: ErpArchiveFile) => Promise<void>;
};

export function ArchiveActionMenu({
  file, archiveView, className, style, dir, onPreview, onDownload, onDelete, onRestore,
}: Props) {
  return (
    <div data-archive-menu className={className} style={style} dir={dir}>
      {archiveView !== "trash" ? (
        <>
          <button type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs hover:bg-[color:var(--foreground-muted)]/10"
            onClick={(e) => { e.stopPropagation(); onPreview(file); }}>
            <Eye size={14} aria-hidden /> תצוגה מקדימה
          </button>
          <button type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs hover:bg-[color:var(--foreground-muted)]/10"
            onClick={(e) => { e.stopPropagation(); void onDownload(file); }}>
            <Download size={14} aria-hidden /> הורדה
          </button>
          <button type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            onClick={(e) => { e.stopPropagation(); onDelete(file); }}>
            <Trash2 size={14} aria-hidden /> העבר לפח
          </button>
        </>
      ) : (
        <>
          <button type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs hover:bg-[color:var(--foreground-muted)]/10"
            onClick={(e) => { e.stopPropagation(); void onRestore(file); }}>
            <RotateCcw size={14} aria-hidden /> שחזור לארכיון
          </button>
          <button type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            onClick={(e) => { e.stopPropagation(); onDelete(file); }}>
            <Trash2 size={14} aria-hidden /> מחיקה לצמיתות
          </button>
        </>
      )}
    </div>
  );
}
