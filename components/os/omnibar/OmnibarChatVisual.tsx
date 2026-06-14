"use client";

import React from "react";
import { Bot, Loader2, Sparkles, User, Wrench } from "lucide-react";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { VoiceStatus } from "./useOmnibarGeminiLive";

export type OmnibarChatEntry = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
};

type OmnibarChatVisualProps = {
  voiceStatus: VoiceStatus;
  statusLabel: string;
  isLiveActive: boolean;
  onToggleLive: () => void;
  onOpenSettings: () => void;
  lastTranscript?: string;
  isBusy?: boolean;
  systemMessage?: string;
  entries?: OmnibarChatEntry[];
};

export default function OmnibarChatVisual({
  voiceStatus,
  statusLabel,
  isLiveActive,
  onToggleLive,
  onOpenSettings,
  lastTranscript,
  isBusy = false,
  systemMessage = "",
  entries = [],
}: OmnibarChatVisualProps) {
  const { t, dir } = useI18n();
  const voiceActive = voiceStatus === "listening" || voiceStatus === "speaking" || voiceStatus === "connecting";

  const displayEntries: OmnibarChatEntry[] = [...entries];
  if (lastTranscript?.trim()) {
    const last = displayEntries[displayEntries.length - 1];
    if (!last || last.content !== lastTranscript.trim()) {
      displayEntries.push({
        id: "live-transcript",
        role: "assistant",
        content: lastTranscript.trim(),
      });
    }
  }

  return (
    <section
      className="flex min-h-[min(26dvh,11rem)] flex-1 flex-col overflow-hidden rounded-2xl border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/60 shadow-inner backdrop-blur-md"
      aria-label={t("workspaceWidgets.omnibar.chatVisualAria")}
      dir={dir}
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--border-main)]/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`h-2 w-2 shrink-0 rounded-full ${
              voiceActive ? "animate-pulse bg-indigo-500" : isBusy ? "animate-pulse bg-amber-400" : "bg-emerald-500"
            }`}
            aria-hidden
          />
          <span className="truncate text-[11px] font-bold text-[color:var(--foreground-main)]">{statusLabel}</span>
        </div>
        {voiceActive ? (
          <span className="shrink-0 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-indigo-700 dark:text-indigo-300">
            {t("workspaceWidgets.omnibar.liveBadge")}
          </span>
        ) : null}
      </div>

      <div className="custom-scrollbar min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-y-contain p-3">
        {displayEntries.length === 0 && !voiceActive ? (
          <div className="flex h-full min-h-[8rem] flex-col items-center justify-center gap-2 px-4 text-center opacity-70">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-700 dark:text-indigo-400">
              <Sparkles size={22} aria-hidden />
            </div>
            <p className="text-xs font-semibold text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.omnibar.chatEmptyHint")}
            </p>
          </div>
        ) : null}

        {displayEntries.map((m) => (
          <div
            key={m.id}
            className={`flex gap-2.5 ${m.role === "user" ? "flex-row-reverse" : ""}`}
          >
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border ${
                m.role === "user"
                  ? "border-[color:var(--border-main)] bg-[color:var(--surface-soft)] text-[color:var(--foreground-main)]"
                  : m.role === "system"
                    ? "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300"
                    : "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400"
              }`}
            >
              {m.role === "user" ? (
                <User size={14} aria-hidden />
              ) : m.role === "system" ? (
                <Wrench size={14} aria-hidden />
              ) : (
                <Bot size={14} aria-hidden />
              )}
            </div>
            <div
              className={`max-w-[85%] rounded-2xl px-3 py-2 text-xs leading-relaxed ${
                m.role === "user"
                  ? "rounded-ee-none bg-indigo-600/90 text-white shadow-sm"
                  : m.role === "system"
                    ? "rounded-ts-none border border-amber-500/20 bg-amber-500/5 text-[color:var(--foreground-main)]"
                    : "rounded-ts-none border border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 text-[color:var(--foreground-main)]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {isBusy ? (
          <div className="flex gap-2.5" aria-live="polite">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-indigo-500/25 bg-indigo-500/10">
              <Loader2 size={14} className="animate-spin text-indigo-400" aria-hidden />
            </div>
            <div className="rounded-2xl rounded-ts-none border border-[color:var(--border-main)] bg-[color:var(--background-main)]/80 px-3 py-2">
              <div className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/50 [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/50" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-indigo-400/50 [animation-delay:0.2s]" />
              </div>
            </div>
          </div>
        ) : null}

        {systemMessage.trim() ? (
          <p className="rounded-lg border border-[color:var(--border-main)]/80 bg-[color:var(--surface-soft)]/50 px-2.5 py-1.5 text-center text-[10px] font-semibold text-[color:var(--foreground-muted)]">
            {systemMessage}
          </p>
        ) : null}
      </div>

      {voiceActive ? (
        <div className="shrink-0 border-t border-[color:var(--border-main)]/60 p-2">
          <GeminiLivePanel
            compact
            statusLabel={statusLabel}
            voiceStatus={voiceStatus}
            isLiveActive={isLiveActive}
            onToggleLive={onToggleLive}
            onOpenSettings={onOpenSettings}
            lastTranscript={lastTranscript}
          />
        </div>
      ) : null}
    </section>
  );
}
