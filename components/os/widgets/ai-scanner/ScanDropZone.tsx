"use client";

import React from "react";
import { Upload, Loader2, ArrowRight, Sparkles } from "lucide-react";
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
  const doneCount = queue.filter((q) => q.status === "done").length;
  const progressPct =
    queueProgress && queueProgress.total > 0
      ? Math.round((queueProgress.current / queueProgress.total) * 100)
      : null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
      className={`relative m-2 flex min-h-[10rem] flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition-all md:m-3 ${
        isDragging
          ? "border-orange-400/70 bg-gradient-to-b from-orange-500/15 to-amber-500/5 shadow-[0_0_32px_-8px_rgba(249,115,22,0.35)]"
          : "border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/30 backdrop-blur-sm"
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-orange-500/[0.04] via-transparent to-indigo-500/[0.05]"
        aria-hidden
      />

      {isProcessing ? (
        <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-4 px-4">
          <div className="relative">
            <div className="absolute inset-0 animate-ping rounded-full bg-orange-500/20" aria-hidden />
            <Loader2 className="relative animate-spin text-orange-500" size={44} aria-hidden />
          </div>
          {queueProgress ? (
            <>
              <p className="text-center text-xs font-bold text-[color:var(--foreground-main)]">
                {formatMsg(tr("scanner.scanProgress", "סורק {current} מתוך {total}: {name}"), {
                  current: queueProgress.current,
                  total: queueProgress.total,
                  name: queueProgress.name,
                })}
              </p>
              {progressPct != null ? (
                <div className="h-2 w-full overflow-hidden rounded-full bg-[color:var(--border-main)]/80">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-orange-500 via-amber-400 to-orange-300 transition-[width] duration-300"
                    style={{ width: `${progressPct}%` }}
                    role="progressbar"
                    aria-valuenow={progressPct}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : (
        <div className="relative z-10 flex flex-col items-center px-4">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-500/25 bg-gradient-to-br from-orange-500/15 to-amber-500/5 text-orange-500 shadow-inner">
            <Upload size={28} aria-hidden />
          </div>
          <p className="flex items-center gap-1.5 text-center text-sm font-black text-[color:var(--foreground-main)]">
            <Sparkles size={14} className="text-orange-400" aria-hidden />
            {t("scanner.drop")}
          </p>
          <p className="mt-1 max-w-xs text-center text-[10px] leading-relaxed text-[color:var(--foreground-muted)]">
            {tr("scanner.acceptHint", SCAN_ACCEPT_SUMMARY)}
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 flex min-h-[44px] items-center gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 px-5 py-2.5 text-xs font-bold text-orange-800 shadow-sm transition hover:bg-orange-500/20 dark:text-orange-200"
          >
            {tr("scanner.selectFiles", "בחר קבצים")} <ArrowRight size={14} className="rtl:rotate-180" aria-hidden />
          </button>
          {queue.length > 0 ? (
            <p className="mt-2 text-[10px] font-bold text-orange-500">
              {doneCount}/{queue.length} {tr("scanner.filesQueued", "קבצים בתור")}
            </p>
          ) : null}
        </div>
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
        <ul className="custom-scrollbar relative z-10 mt-4 max-h-32 w-full max-w-md space-y-1.5 overflow-y-auto px-4 pb-3">
          {queue.map((item) => (
            <li
              key={item.id}
              className="flex min-h-[36px] items-center justify-between gap-2 rounded-xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/70 px-3 py-2 text-[10px] backdrop-blur-sm"
            >
              <span className="truncate font-bold">{item.file.name}</span>
              <span
                className={
                  item.status === "done"
                    ? "shrink-0 font-black text-emerald-500"
                    : item.status === "error"
                      ? "shrink-0 font-black text-red-500"
                      : item.status === "processing"
                        ? "shrink-0 font-black text-orange-500"
                        : "shrink-0 text-[color:var(--foreground-muted)]"
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
        <div className="relative z-10 mt-4 w-full max-w-md px-3 pb-3">
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
