"use client";

import React from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { X } from "lucide-react";
import type { DriveDecodePreviewItem } from "@/lib/google-drive-decode-types";
import { OS_MODAL_BACKDROP_Z, OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import { OsButton, OsIconButton } from "@/components/os/ui";

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
  const { t, dir } = useI18n();

  if (!open) return null;

  const pending = items.filter((i) => i.decodeStatus === "NEEDS_REVIEW" || i.needsReview);

  return (
    <div
      className="fixed inset-0 flex items-end justify-center p-4 sm:items-center"
      style={{ zIndex: OS_MODAL_PANEL_Z }}
      role="presentation"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: OS_MODAL_BACKDROP_Z }}
        aria-label={t("workspaceWidgets.googleDrive.close")}
        onClick={onClose}
      />
      <div
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-2xl"
        style={{ zIndex: OS_MODAL_PANEL_Z }}
        dir={dir}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border-main)] px-4 py-3">
          <h3 className="text-sm font-black">{t("workspaceWidgets.googleDrive.decodeTitle")}</h3>
          <OsIconButton label={t("workspaceWidgets.googleDrive.close")} onClick={onClose}>
            <X size={18} aria-hidden />
          </OsIconButton>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain p-4 space-y-4">
          {pending.length === 0 ? (
            <p className="text-sm text-[color:var(--foreground-muted)]">{t("workspaceWidgets.googleDrive.noPending")}</p>
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
                      {t("workspaceWidgets.googleDrive.docType")}
                      <input
                        value={item.editedDocType}
                        onChange={(e) =>
                          onChange(item.driveFileId, { editedDocType: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                      {t("workspaceWidgets.googleDrive.clientName")}
                      <input
                        value={item.editedClientName}
                        onChange={(e) =>
                          onChange(item.driveFileId, { editedClientName: e.target.value })
                        }
                        placeholder={t("workspaceWidgets.googleDrive.clientPlaceholder")}
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      />
                    </label>
                    <label className="block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                      {t("workspaceWidgets.googleDrive.saveTarget")}
                      <select
                        value={item.editedTarget}
                        onChange={(e) =>
                          onChange(item.driveFileId, {
                            editedTarget: e.target.value as "ERP" | "CRM",
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1.5 text-sm"
                      >
                        <option value="ERP">{t("workspaceWidgets.googleDrive.targetErp")}</option>
                        <option value="CRM">{t("workspaceWidgets.googleDrive.targetCrm")}</option>
                      </select>
                    </label>
                    <OsButton
                      variant="quiet"
                      size="sm"
                      className="!px-0 text-[10px] text-[color:var(--foreground-muted)] underline"
                      onClick={() => onSkip(item.driveFileId)}
                    >
                      {t("workspaceWidgets.googleDrive.skip")}
                    </OsButton>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-2 border-t border-[color:var(--border-main)] p-4">
          <OsButton
            variant="primary"
            className="flex-1 justify-center"
            disabled={pending.length === 0}
            loading={saving}
            onClick={onSaveAll}
          >
            {t("workspaceWidgets.googleDrive.saveAll")}
          </OsButton>
          <OsButton variant="secondary" onClick={onClose}>
            {t("workspaceWidgets.googleDrive.close")}
          </OsButton>
        </div>
      </div>
    </div>
  );
}
