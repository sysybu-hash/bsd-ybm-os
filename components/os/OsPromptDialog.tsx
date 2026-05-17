"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { useEffect, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";

export type OsPromptDialogProps = {
  open: boolean;
  title: string;
  label?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

export default function OsPromptDialog({
  open,
  title,
  label,
  defaultValue = "",
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: OsPromptDialogProps) {
  const { t } = useI18n();
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (open) setValue(defaultValue);
  }, [open, defaultValue]);

  const confirm = confirmLabel ?? t("workspaceWidgets.confirm.confirm");
  const cancel = cancelLabel ?? t("workspaceWidgets.confirm.cancel");

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-[200]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-md rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl">
          <DialogTitle className="text-base font-bold text-[color:var(--foreground-main)]">{title}</DialogTitle>
          {label ? <p className="mt-1 text-sm text-[color:var(--foreground-muted)]">{label}</p> : null}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="mt-4 w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] px-3 py-2 text-sm text-[color:var(--foreground-main)] outline-none focus:ring-2 focus:ring-indigo-500"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") onConfirm(value.trim());
            }}
          />
          <div className="mt-6 flex justify-end gap-3">
            <button type="button" onClick={onCancel} className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-sm font-semibold">
              {cancel}
            </button>
            <button
              type="button"
              onClick={() => onConfirm(value.trim())}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white hover:bg-indigo-500"
            >
              {confirm}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
