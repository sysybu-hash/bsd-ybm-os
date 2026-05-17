"use client";

import React, { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import OsConfirmDialog from "@/components/os/OsConfirmDialog";

interface ItemActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  deleteConfirmMessage?: string;
  deleteTitle?: string;
  className?: string;
}

export default function ItemActions({
  onEdit,
  onDelete,
  editLabel,
  deleteLabel,
  deleteConfirmMessage,
  deleteTitle,
  className = "",
}: ItemActionsProps) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const edit = editLabel ?? t("workspaceWidgets.itemActions.edit");
  const del = deleteLabel ?? t("workspaceWidgets.itemActions.delete");
  const confirmMsg = deleteConfirmMessage ?? t("workspaceWidgets.itemActions.deleteConfirm");
  const confirmTitle = deleteTitle ?? t("workspaceWidgets.itemActions.deleteTitle");

  const handleDeleteClick = () => {
    if (onDelete) setConfirmOpen(true);
  };

  if (!onEdit && !onDelete) return null;

  return (
    <>
      <div className={`flex items-center gap-0.5 ${className}`}>
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-indigo-600"
            aria-label={edit}
            title={edit}
          >
            <Pencil size={13} aria-hidden />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={handleDeleteClick}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-600"
            aria-label={del}
            title={del}
          >
            <Trash2 size={13} aria-hidden />
          </button>
        ) : null}
      </div>
      <OsConfirmDialog
        open={confirmOpen}
        title={confirmTitle}
        message={confirmMsg}
        destructive
        onConfirm={() => {
          setConfirmOpen(false);
          onDelete?.();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
