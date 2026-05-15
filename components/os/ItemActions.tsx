"use client";

import React from "react";
import { Pencil, Trash2 } from "lucide-react";

interface ItemActionsProps {
  onEdit?: () => void;
  onDelete?: () => void;
  editLabel?: string;
  deleteLabel?: string;
  deleteConfirmMessage?: string;
  className?: string;
}

export default function ItemActions({
  onEdit,
  onDelete,
  editLabel = "ערוך",
  deleteLabel = "מחק",
  deleteConfirmMessage = "למחוק את הפריט?",
  className = "",
}: ItemActionsProps) {
  const handleDelete = () => {
    if (!onDelete) return;
    if (typeof window !== "undefined" && !window.confirm(deleteConfirmMessage)) return;
    onDelete();
  };

  if (!onEdit && !onDelete) return null;

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-indigo-600"
          aria-label={editLabel}
          title={editLabel}
        >
          <Pencil size={13} aria-hidden />
        </button>
      ) : null}
      {onDelete ? (
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-7 w-7 items-center justify-center rounded-md text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-600"
          aria-label={deleteLabel}
          title={deleteLabel}
        >
          <Trash2 size={13} aria-hidden />
        </button>
      ) : null}
    </div>
  );
}
