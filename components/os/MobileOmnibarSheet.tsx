"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import Omnibar from "@/components/os/Omnibar";
import OmnibarLauncherTray from "@/components/os/omnibar/OmnibarLauncherTray";
import type { OmnibarChatEntry } from "@/components/os/omnibar/OmnibarChatVisual";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";
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
  openWorkspaceWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  assistantToolDeps?: OsAssistantToolDeps;
};

export default function MobileOmnibarSheet({
  open,
  onClose,
  systemMessage,
  onCommand,
  apiLatency,
  isBusy,
  onSearchPreview,
  searchResults = [],
  onSelectResult,
  openWorkspaceWidget,
  assistantToolDeps,
}: MobileOmnibarSheetProps) {
  const { t } = useI18n();
  const [chatEntries, setChatEntries] = useState<OmnibarChatEntry[]>([]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setChatEntries([]);
  }, [open]);

  useEffect(() => {
    if (!systemMessage.trim()) return;
    setChatEntries((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "system" && last.content === systemMessage) return prev;
      return [
        ...prev.filter((e) => e.id !== "system-status"),
        { id: "system-status", role: "system", content: systemMessage },
      ];
    });
  }, [systemMessage]);

  const handleCommand = useCallback(
    async (cmd: string) => {
      const trimmed = cmd.trim();
      if (!trimmed) return;
      setChatEntries((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: "user", content: trimmed },
      ]);
      await onCommand(trimmed);
    },
    [onCommand],
  );

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
            className="fixed inset-0 z-[1040] bg-black/45 backdrop-blur-[3px]"
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
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-[1050] flex max-h-[min(92dvh,calc(100dvh-env(safe-area-inset-top,0px)))] flex-col overflow-hidden rounded-t-3xl border border-[color:var(--border-main)] border-b-0 bg-[color:var(--background-main)]/98 shadow-2xl backdrop-blur-xl"
            style={{
              paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="mx-auto mt-2 mb-1 flex w-12 shrink-0 justify-center py-1" aria-hidden>
              <div className="h-1 w-10 rounded-full bg-[color:var(--foreground-muted)]/35" />
            </div>

            <div className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2">
              <span className="text-sm font-black tracking-wide text-[color:var(--foreground-main)]">
                {t("workspaceWidgets.omnibar.sheetTitle")}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
                aria-label={t("workspaceWidgets.chrome.closeLabel")}
              >
                <X size={22} aria-hidden />
              </button>
            </div>

            <div className="custom-scrollbar flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-y-contain px-4">
              <Omnibar
                layout="stacked"
                embedInSheet
                chatEntries={chatEntries}
                onCommand={handleCommand}
                apiLatency={apiLatency}
                isBusy={isBusy}
                status="ready"
                message={systemMessage}
                onSearchPreview={onSearchPreview}
                searchResults={searchResults}
                onSelectResult={onSelectResult}
                openWorkspaceWidget={(type, data) => {
                  openWorkspaceWidget(type, data);
                  onClose();
                }}
                assistantToolDeps={assistantToolDeps}
              />

              <OmnibarLauncherTray
                openWorkspaceWidget={openWorkspaceWidget}
                onCloseSheet={onClose}
              />
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
