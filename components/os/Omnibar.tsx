"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Mic, Send, SlidersHorizontal, Volume2, HardHat } from "lucide-react";
import { useSession } from "next-auth/react";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";
import type { WidgetType } from "@/hooks/use-window-manager";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useOmnibarGeminiLive } from "./omnibar/useOmnibarGeminiLive";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

interface OmnibarProps {
  onCommand: (cmd: string) => void | Promise<void>;
  apiLatency?: number | null;
  isBusy?: boolean;
  status?: "ready" | "fetching" | "error";
  message?: string;
  onSearchPreview?: (query: string) => void;
  searchResults?: SearchResult[];
  onSelectResult?: (result: SearchResult) => void;
  openWorkspaceWidget: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  assistantToolDeps?: OsAssistantToolDeps;
}

export default function Omnibar({
  onCommand, apiLatency, isBusy = false, status = "ready", message = "",
  onSearchPreview, searchResults = [], onSelectResult,
  openWorkspaceWidget, assistantToolDeps: assistantToolDepsProp,
}: OmnibarProps) {
  const { t, dir, locale } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();
  const assistantToolDeps = assistantToolDepsProp ?? automationCtx?.assistantToolDeps ?? { openWidget: openWorkspaceWidget };

  const [input, setInput] = useState("");

  const osAssistant = useOsAssistant(assistantToolDeps);

  useEffect(() => {
    if (session?.user?.id) void osAssistant.refresh();
  }, [session?.user?.id, osAssistant.refresh, osAssistant]);

  const liveUserName = osAssistant.context?.user?.name?.trim() || session?.user?.name?.trim() || undefined;

  const live = useOmnibarGeminiLive({
    sessionUserId: session?.user?.id,
    sessionOrgId: session?.user?.organizationId,
    osAssistant,
    userName: liveUserName,
    locale,
    t,
  });

  const statusLabel =
    live.voiceStatus === "connecting" ? t("workspaceWidgets.omnibar.voiceConnecting") :
    live.voiceStatus === "listening" ? t("workspaceWidgets.omnibar.voiceListening") :
    live.voiceStatus === "speaking" ? t("workspaceWidgets.omnibar.voiceSpeaking") :
    isBusy ? t("workspaceWidgets.omnibar.processing") :
    typeof apiLatency === "number" ? `${Math.round(apiLatency)}ms` :
    status === "error" ? t("workspaceWidgets.omnibar.error") :
    t("workspaceWidgets.omnibar.ready");

  const handleInputChange = (val: string) => { setInput(val); onSearchPreview?.(val); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    await onCommand(value);
    setInput("");
  };

  return (
    <div className="relative z-50 w-full px-0 md:px-4" dir={dir}>
      <form onSubmit={handleSubmit} className="relative">
        <div className={`relative flex min-h-[2.75rem] w-full items-stretch overflow-hidden rounded-[var(--radius-md)] border shadow-md transition-shadow ${live.voiceActive ? "border-indigo-400/50 ring-2 ring-indigo-500/25" : "border-[color:var(--border-main)]"} bg-[color:var(--surface-card)]`}>

          {/* Status badge */}
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-[color:var(--border-main)]/30 py-2 pl-2 pr-1 sm:gap-2 sm:pl-3 sm:pr-2">
            <div className="flex max-w-[5.5rem] items-center gap-1.5 rounded-md border border-[color:var(--border-main)] bg-[color:var(--background-main)]/60 px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] sm:max-w-[10rem] sm:gap-2 sm:px-2.5">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${live.voiceStatus !== "idle" ? "animate-pulse bg-indigo-500" : isBusy ? "animate-pulse bg-amber-400" : status === "error" ? "bg-rose-500" : "bg-emerald-500"}`} />
              <span className="min-w-0 truncate sm:whitespace-normal">{statusLabel}</span>
            </div>
          </div>

          {/* Text input */}
          <div className="relative z-10 min-w-0 flex-1 flex items-center">
            <label className="sr-only" htmlFor="omnibar-command">{t("workspaceWidgets.omnibar.commandLabel")}</label>
            <input
              id="omnibar-command" type="text" value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={live.voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.placeholderVoice") : t("workspaceWidgets.omnibar.placeholder")}
              className="h-full w-full min-w-0 border-0 bg-transparent px-2 py-3 text-sm font-medium text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-none outline-none ring-0 focus:ring-0 md:px-3"
              autoComplete="off"
            />
          </div>

          {/* Actions */}
          <div className="relative z-10 flex shrink-0 items-center gap-1.5 py-2 pr-2 pl-1 sm:gap-2 sm:pr-3 sm:pl-2">
            <button type="button" onClick={() => openWorkspaceWidget("fieldCopilot")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-amber-600 transition hover:bg-amber-500/10 dark:text-amber-300"
              title={t("workspaceWidgets.sidebar.fieldCopilot")}
              aria-label={t("workspaceWidgets.sidebar.fieldCopilot")}>
              <HardHat size={18} aria-hidden />
            </button>
            <button type="button" onClick={() => live.setGeminiLiveSettingsOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-indigo-300"
              title={t("workspaceWidgets.omnibar.voiceSettingsTitle")} aria-label={t("workspaceWidgets.omnibar.voiceSettingsAria")} aria-expanded={live.geminiLiveSettingsOpen} aria-haspopup="dialog">
              <SlidersHorizontal size={18} aria-hidden />
            </button>
            <button type="button" onClick={live.toggleLive}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${live.voiceActive ? "bg-indigo-600 text-white shadow-sm" : "border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}
              title={live.voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
              aria-label={live.voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
              aria-pressed={live.voiceStatus !== "idle"}>
              {live.voiceStatus === "connecting" ? <Loader2 size={18} className="animate-spin" aria-hidden /> :
               live.voiceStatus === "speaking" ? <Volume2 size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
            </button>
            <button type="submit" className="quiet-button quiet-button-primary h-10 shrink-0 px-3 text-xs" aria-label={t("workspaceWidgets.omnibar.sendAria")}>
              <Send size={15} aria-hidden />
              <span className="hidden sm:inline">{t("workspaceWidgets.omnibar.send")}</span>
            </button>
          </div>
        </div>
      </form>

      {live.voiceActive ? (
        <div className="mt-2 space-y-2">
          <GeminiLivePanel
            compact statusLabel={statusLabel} voiceStatus={live.voiceStatus}
            isLiveActive={live.geminiLive.isLiveActive} onToggleLive={live.toggleLive}
            onOpenSettings={() => live.setGeminiLiveSettingsOpen(true)}
            lastTranscript={live.geminiLive.lastTranscript}
          />
          <button type="button" onClick={() => openWorkspaceWidget("aiChatFull", { startLive: true })}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-[10px] font-bold text-indigo-300 hover:bg-[color:var(--surface-soft)]">
            {t("workspaceWidgets.omnibar.openFullLiveChat")}
          </button>
        </div>
      ) : null}

      {searchResults.length > 0 && input.trim() ? (
        <div className="absolute bottom-full mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg">
          {searchResults.map((result, idx) => (
            <button key={`${result.type}-${result.name}-${idx}`} type="button"
              onClick={() => { onSelectResult?.(result); setInput(""); }}
              className="flex w-full items-center justify-between border-b border-[color:var(--border-main)]/50 p-3 text-right transition last:border-0 hover:bg-[color:var(--surface-soft)]">
              <div className="flex items-center gap-3">
                <div className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-black ${result.type === "contact" ? "bg-indigo-500/15 text-indigo-200" : "bg-emerald-500/15 text-emerald-300"}`}>
                  {result.type === "contact" ? "CRM" : "PRJ"}
                </div>
                <div>
                  <div className="text-xs font-black text-[color:var(--foreground-main)]">{result.name}</div>
                  {result.taxId ? <div className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.omnibar.taxId", { id: result.taxId })}</div> : null}
                </div>
              </div>
              {typeof result.relevance === "number" ? <div className="text-[10px] font-mono text-[color:var(--foreground-muted)]">{Math.round(result.relevance * 100)}%</div> : null}
            </button>
          ))}
        </div>
      ) : null}

      {message ? (
        <div className="mx-auto mt-1 max-w-2xl truncate rounded-md border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/90 px-3 py-1 text-center text-[10px] font-semibold text-[color:var(--foreground-muted)] shadow-sm">
          {message}
        </div>
      ) : null}

      <GeminiLiveSettingsSheet
        open={live.geminiLiveSettingsOpen} onClose={() => live.setGeminiLiveSettingsOpen(false)}
        value={live.geminiVoiceSettings} onChange={live.setGeminiVoiceSettings}
        isLiveActive={live.geminiLive.isLiveActive}
        advancedFeaturesEnabled={live.advancedFeaturesEnabled}
      />
    </div>
  );
}
