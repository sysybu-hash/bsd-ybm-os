"use client";

import React, { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Omnibar from "@/components/os/Omnibar";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { WidgetType } from "@/hooks/use-window-manager";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

export type MobileOmnibarSheetProps = {
  open: boolean;
  onClose: () => void;
  systemMessage: string;
  onCommand: (cmd: string) => void | Promise<void>;
  apiLatency: number | null;
  isBusy: boolean;
  onSearchPreview?: (query: string) => void;
  searchResults?: SearchResult[];
  onSelectResult?: (result: SearchResult) => void;
  openWorkspaceWidget: (type: WidgetType) => void;
};

export default function MobileOmnibarSheet({
  open,
  onClose,
  systemMessage,
  onCommand,
  apiLatency,
  isBusy,
  onSearchPreview,
  searchResults,
  onSelectResult,
  openWorkspaceWidget,
}: MobileOmnibarSheetProps) {
  const { t } = useI18n();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[1040] bg-black/40 backdrop-blur-[2px]"
            aria-label={t("workspaceWidgets.omnibar.sheetCloseAria")}
            onClick={onClose}
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={t("workspaceWidgets.omnibar.sheetAria")}
            data-testid="mobile-omnibar-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-[1050] max-h-[min(85dvh,calc(100dvh-4rem))] overflow-y-auto overscroll-y-contain rounded-t-2xl border border-[color:var(--border-main)] border-b-0 bg-[color:var(--background-main)]/98 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl backdrop-blur-xl [-webkit-overflow-scrolling:touch]"
          >
            <div className="mx-auto mb-3 flex w-10 shrink-0 rounded-full bg-[color:var(--foreground-muted)]/25 py-1" aria-hidden>
              <div className="mx-auto h-1 w-8 rounded-full bg-[color:var(--foreground-muted)]/50" />
            </div>

            <div className="mb-3 flex items-center justify-between gap-2">
              <span className="text-xs font-black tracking-wide text-[color:var(--foreground-main)]">
                {t("workspaceWidgets.omnibar.sheetTitle")}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-[color:var(--foreground-main)]"
                aria-label={t("workspaceWidgets.chrome.closeLabel")}
              >
                <X size={22} aria-hidden />
              </button>
            </div>

            <Omnibar
              onCommand={async (cmd) => {
                await onCommand(cmd);
              }}
              apiLatency={apiLatency}
              isBusy={isBusy}
              status="ready"
              message={systemMessage}
              onSearchPreview={onSearchPreview}
              searchResults={searchResults}
              onSelectResult={onSelectResult}
              openWorkspaceWidget={openWorkspaceWidget}
            />
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
