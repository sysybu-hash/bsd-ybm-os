"use client";

import React from "react";
import { Upload, Loader2, ArrowRight } from "lucide-react";
import ScanFilePreview from "@/components/os/widgets/scan/ScanFilePreview";
import { SCAN_ACCEPT_SUMMARY } from "@/lib/scan-mime";
import type { QueueItem } from "./types";
import { formatMsg } from "./constants";

type ScanDropZoneProps = {
  isDragging: boolean;
  setIsDragging: (v: boolean) => void;
  isProcessing: boolean;
  queue: QueueItem[];
  queueProgress: { current: number; total: number; name: string } | null;
  hasPendingAnalysis: boolean;
  previewUrl: string | null;
  previewMime: string | null;
  previewFileName: string;
  fileAccept: string;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onDrop: (e: React.DragEvent) => void;
  onFileInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  applyFilePreview: (file: File) => void;
  t: (key: string) => string;
  tr: (key: string, fallback: string) => string;
};

export function ScanDropZone({
  isDragging,
  setIsDragging,
  isProcessing,
  queue,
  queueProgress,
  hasPendingAnalysis,
  previewUrl,
  previewMime,
  previewFileName,
  fileAccept,
  fileInputRef,
  onDrop,
  onFileInputChange,
  applyFilePreview,
  t,
  tr,
}: ScanDropZoneProps) {
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`m-2 flex min-h-[9rem] flex-1 flex-col items-center justify-center rounded-2xl border-2 border-dashed transition md:m-3 ${
        isDragging ? "border-orange-500/50 bg-orange-500/5" : "border-[color:var(--border-main)]"
      }`}
    >
      {isProcessing ? (
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="animate-spin text-orange-500" size={40} />
          {queueProgress ? (
            <p className="px-4 text-center text-[10px] font-bold text-[color:var(--foreground-muted)]">
              {formatMsg(tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}"), {
                current: queueProgress.current,
                total: queueProgress.total,
                name: queueProgress.name,
              })}
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <Upload size={36} className="mb-3 text-[color:var(--foreground-muted)]" />
          <p className="px-4 text-center text-xs font-bold">{t("scanner.drop")}</p>
          <p className="mt-1 px-4 text-center text-[9px] text-[color:var(--foreground-muted)]">
            {tr("scanner.acceptHint", SCAN_ACCEPT_SUMMARY)}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 flex items-center gap-2 rounded-xl border border-[color:var(--border-main)] px-4 py-2 text-xs font-bold"
          >
            {tr("scanner.selectFiles", "בחר קבצים")} <ArrowRight size={14} />
          </button>
          {queue.length > 0 ? (
            <p className="mt-2 text-[10px] font-bold text-orange-500">
              {queue.filter((q) => q.status === "done").length}/{queue.length}{" "}
              {tr("scanner.filesQueued", "קבצים בתור")}
            </p>
          ) : null}
        </>
      )}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept={fileAccept}
        onChange={onFileInputChange}
      />
      {queue.length > 0 && !hasPendingAnalysis ? (
        <ul className="custom-scrollbar mt-3 max-h-28 w-full max-w-sm space-y-1 overflow-y-auto px-4">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60 px-2 py-1 text-[9px]"
            >
              <span className="truncate font-bold">{item.file.name}</span>
              <span
                className={
                  item.status === "done"
                    ? "text-emerald-500"
                    : item.status === "error"
                      ? "text-red-500"
                      : item.status === "processing"
                        ? "text-orange-500"
                        : "text-[color:var(--foreground-muted)]"
                }
              >
                {item.status === "done"
                  ? tr("scanner.queueStatusDone", "הושלם")
                  : item.status === "error"
                    ? tr("scanner.queueStatusError", "שגיאה")
                    : item.status === "processing"
                      ? tr("scanner.queueStatusProcessing", "מעבד")
                      : tr("scanner.queueStatusPending", "ממתין")}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {previewFileName ? (
        <div className="mt-4 w-full max-w-sm px-2">
          <ScanFilePreview
            url={previewUrl}
            mime={previewMime}
            fileName={previewFileName}
            emptyLabel={tr("scanner.noPreview", "אין תצוגה מקדימה לסוג קובץ זה")}
          />
        </div>
      ) : null}
    </div>
  );
}
