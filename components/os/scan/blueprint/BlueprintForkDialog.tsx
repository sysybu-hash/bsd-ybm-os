"use client";

import React from "react";
import { Dialog, DialogBackdrop, DialogPanel, DialogTitle } from "@headlessui/react";
import { OS_MODAL_BACKDROP_Z, OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";

type BlueprintForkDialogProps = {
  open: boolean;
  fileName?: string;
  tr: (key: string, fallback: string) => string;
  onApproveAi: () => void;
  onTakeoff: () => void;
  onDismiss: () => void;
};

export function BlueprintForkDialog({
  open,
  fileName,
  tr,
  onApproveAi,
  onTakeoff,
  onDismiss,
}: BlueprintForkDialogProps) {
  const message = tr(
    "workspaceWidgets.documentScan.blueprintForkMessage",
    "המערכת חילצה כתב כמויות מ-AI עבור {name}. לאשר את התוצאה או לעבור למדידה ידנית?",
  ).replace("{name}", fileName ?? "");

  return (
    <Dialog open={open} onClose={onDismiss} className="relative" style={{ zIndex: OS_MODAL_PANEL_Z }}>
      <DialogBackdrop
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        style={{ zIndex: OS_MODAL_BACKDROP_Z }}
      />
      <div className="fixed inset-0 flex items-center justify-center p-4" style={{ zIndex: OS_MODAL_PANEL_Z }}>
        <DialogPanel className="w-full max-w-md rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-6 shadow-2xl">
          <DialogTitle className="text-base font-bold">
            {tr("workspaceWidgets.documentScan.blueprintForkTitle", "זוהתה גרמושקה")}
          </DialogTitle>
          <p className="mt-2 text-sm text-[color:var(--foreground-muted)]">{message}</p>
          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onApproveAi}
              className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
            >
              {tr("workspaceWidgets.documentScan.blueprintApproveAi", "אשר BOQ מ-AI")}
            </button>
            <button
              type="button"
              onClick={onTakeoff}
              className="rounded-xl border border-indigo-500/40 bg-indigo-500/10 px-4 py-2.5 text-sm font-bold text-indigo-700 dark:text-indigo-300"
            >
              {tr("workspaceWidgets.documentScan.blueprintTakeoff", "מדוד ב-Takeoff")}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-xl px-4 py-2 text-xs font-semibold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            >
              {tr("workspaceWidgets.documentScan.blueprintDismiss", "המשך לסקירה")}
            </button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
