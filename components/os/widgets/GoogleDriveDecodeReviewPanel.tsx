"use client";

import React from "react";
import { Loader2, X } from "lucide-react";
import type { DriveDecodePreviewItem } from "@/lib/google-drive-decode-types";

export type ReviewEditableItem = DriveDecodePreviewItem & {
  editedClientName: string;
  editedDocType: string;
  editedTarget: "ERP" | "CRM";
};

type Props = {
  open: boolean;
  items: ReviewEditableItem[];
  saving: boolean;
  onClose: () => void;
  onChange: (driveFileId: string, patch: Partial<ReviewEditableItem>) => void;
  onSaveAll: () => void;
  onSkip: (driveFileId: string) => void;
};

export default function GoogleDriveDecodeReviewPanel({
  open,
  items,
  saving,
  onClose,
  onChange,
  onSaveAll,
  onSkip,
}: Props) {
  if (!open) return null;

  const pending = items.filter((i) => i.decodeStatus === "NEEDS_REVIEW" || i.needsReview);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/50 p-4 sm:items-center" role="presentation">
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl"
        dir="rtl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-main)] px-4 py-3">
          <h3 className="text-sm font-black">תוצאות פענוח — אישור שמירה</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5" aria-label="סגור">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">אין פריטים הממתינים לאישור.</p>
          ) : (
            pending.map((item) => (
              <div
                key={item.driveFileId}
                className="rounded-xl border border-[color:var(--border-main)] p-3 space-y-2"
              >
                <p className="text-xs font-bold truncate">{item.fileName}</p>
                {item.error ? (
                  <p className="text-xs text-rose-500">{item.error}</p>
                ) : (
                  <>
                    <label className="block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                      סוג מסמך
                      <input
                        value={item.editedDocType}
                        onChange={(e) =>
                          onChange(item.driveFileId, { editedDocType: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                      שם לקוח
                      <input
                        value={item.editedClientName}
                        onChange={(e) =>
                          onChange(item.driveFileId, { editedClientName: e.target.value })
                        }
                        placeholder="הזינו שם לקוח"
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                      יעד שמירה
                      <select
                        value={item.editedTarget}
                        onChange={(e) =>
                          onChange(item.driveFileId, {
                            editedTarget: e.target.value as "ERP" | "CRM",
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      >
                        <option value="ERP">ERP — ארכיון מסמכים</option>
                        <option value="CRM">CRM — לקוח</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => onSkip(item.driveFileId)}
                      className="text-[10px] font-bold text-[color:var(--foreground-muted)] underline"
                    >
                      דלג
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t border-[color:var(--border-main)] p-4">
          <button
            type="button"
            disabled={saving || pending.length === 0}
            onClick={onSaveAll}
            className="flex-1 rounded-xl bg-violet-600 py-2.5 text-xs font-black text-white disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="mx-auto animate-spin" /> : "שמור הכל"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-[color:var(--border-main)] px-4 py-2.5 text-xs font-bold"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}
