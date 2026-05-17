"use client";

import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { useI18n } from "@/components/os/system/I18nProvider";

export type OsConfirmDialogProps = {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export default function OsConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: OsConfirmDialogProps) {
  const { t } = useI18n();
  const confirm = confirmLabel ?? t("workspaceWidgets.confirm.confirm");
  const cancel = cancelLabel ?? t("workspaceWidgets.confirm.cancel");

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-[200]">
      <DialogBackdrop className="fixed inset-0 bg-black/50 backdrop-blur-sm" transition />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="os-confirm-title"
          className="w-full max-w-md rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl"
        >
          <DialogTitle id="os-confirm-title" className="text-base font-bold text-[color:var(--foreground-main)]">
            {title}
          </DialogTitle>
          {message ? (
            <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">{message}</p>
          ) : null}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-lg border border-[color:var(--border-main)] px-4 py-2 text-sm font-semibold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
              aria-label={cancel}
            >
              {cancel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className={`rounded-lg px-4 py-2 text-sm font-bold text-white ${
                destructive ? "bg-rose-600 hover:bg-rose-500" : "bg-indigo-600 hover:bg-indigo-500"
              }`}
              aria-label={confirm}
            >
              {confirm}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
