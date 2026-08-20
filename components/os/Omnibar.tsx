"use client";

import React, { useState } from "react";
import { Loader2 } from "lucide-react";
import { useSession } from "next-auth/react";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";
import type { WidgetType } from "@/hooks/use-window-manager";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import GeminiLivePanel from "@/components/os/gemini-live/GeminiLivePanel";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useOmnibarGeminiLive } from "./omnibar/useOmnibarGeminiLive";
import OmnibarChatVisual, { type OmnibarChatEntry } from "./omnibar/OmnibarChatVisual";
import { OmnibarSearchDropdown } from "./omnibar/OmnibarSearchDropdown";
import { OmnibarActionButtons } from "./omnibar/OmnibarActionButtons";

type SearchResult = {
  type: "project" | "contact";
  name: string;
  taxId?: string;
  relevance?: number;
};

export type OmnibarLayout = "inline" | "stacked";

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
  /** מובייל / sheet — שורת טקסט נפרדת מכפתורים */
  layout?: OmnibarLayout;
  /** כשהשיחה מוצגת בחלון sheet — לא לשכפל פאנל Live מתחת */
  embedInSheet?: boolean;
  /** הודעות שיחה (sheet מובייל) */
  chatEntries?: OmnibarChatEntry[];
}

export default function Omnibar({
  onCommand,
  apiLatency,
  isBusy = false,
  status = "ready",
  message = "",
  onSearchPreview,
  searchResults = [],
  onSelectResult,
  openWorkspaceWidget,
  assistantToolDeps: assistantToolDepsProp,
  layout = "inline",
  embedInSheet = false,
  chatEntries = [],
}: OmnibarProps) {
  const { t, dir, locale } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();
  const assistantToolDeps =
    assistantToolDepsProp ?? automationCtx?.assistantToolDeps ?? { openWidget: openWorkspaceWidget };

  const [input, setInput] = useState("");

  const osAssistant = useOsAssistant(assistantToolDeps);

  const liveUserName =
    osAssistant.context?.user?.name?.trim() || session?.user?.name?.trim() || undefined;

  const live = useOmnibarGeminiLive({
    sessionUserId: session?.user?.id,
    sessionOrgId: session?.user?.organizationId,
    osAssistant,
    userName: liveUserName,
    locale,
    t,
  });

  const statusLabel =
    live.voiceStatus === "connecting"
      ? t("workspaceWidgets.omnibar.voiceConnecting")
      : live.voiceStatus === "listening"
        ? t("workspaceWidgets.omnibar.voiceListening")
        : live.voiceStatus === "speaking"
          ? t("workspaceWidgets.omnibar.voiceSpeaking")
          : isBusy
            ? t("workspaceWidgets.omnibar.processing")
            : typeof apiLatency === "number"
              ? `${Math.round(apiLatency)}ms`
              : status === "error"
                ? t("workspaceWidgets.omnibar.error")
                : t("workspaceWidgets.omnibar.ready");

  const handleInputChange = (val: string) => {
    setInput(val);
    onSearchPreview?.(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (!value) return;
    await onCommand(value);
    setInput("");
  };

  const statusBadge = (
    <div className="flex max-w-full items-center gap-1.5 rounded-md border border-[color:var(--border-main)] bg-[color:var(--background-main)]/60 px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] sm:px-2.5">
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
          live.voiceStatus !== "idle"
            ? "animate-pulse bg-[color:var(--win-accent,#6366f1)]"
            : isBusy
              ? "animate-pulse bg-amber-400"
              : status === "error"
                ? "bg-rose-500"
                : "bg-emerald-500"
        }`}
      />
      <span className="min-w-0 truncate">{statusLabel}</span>
    </div>
  );

  const actionButtons = (
    <OmnibarActionButtons
      layout={layout} voiceStatus={live.voiceStatus} voiceActive={live.voiceActive}
      rateLimitActive={live.rateLimitActive} rateLimitLabel={live.rateLimitLabel} t={t}
      openWorkspaceWidget={openWorkspaceWidget}
      onOpenSettings={() => live.setGeminiLiveSettingsOpen(true)}
      onToggleLive={live.toggleLive}
    />
  );

  const inputField = (
    <>
      <label className="sr-only" htmlFor="omnibar-command">
        {t("workspaceWidgets.omnibar.commandLabel")}
      </label>
      <input
        id="omnibar-command"
        type="text"
        value={input}
        onChange={(e) => handleInputChange(e.target.value)}
        placeholder={
          live.voiceStatus !== "idle"
            ? t("workspaceWidgets.omnibar.placeholderVoice")
            : t("workspaceWidgets.omnibar.placeholder")
        }
        className={
          layout === "stacked"
            ? "min-h-[44px] w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--background-main)]/50 px-3 py-2.5 text-sm font-medium text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] outline-none ring-0 focus:border-indigo-500/50 focus:ring-2 focus:ring-indigo-500/20"
            : "h-full w-full min-w-0 border-0 bg-transparent px-2 py-3 text-sm font-medium text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-none outline-none ring-0 focus:ring-0 md:px-3"
        }
        autoComplete="off"
      />
    </>
  );

  const shellBorder = live.voiceActive
    ? "border-indigo-400/50 ring-2 ring-indigo-500/25"
    : "border-[color:var(--border-main)]";

  return (
    <div className="relative z-50 w-full px-0 md:px-4" dir={dir}>
      {embedInSheet ? (
        <OmnibarChatVisual
          voiceStatus={live.voiceStatus}
          statusLabel={statusLabel}
          isLiveActive={live.geminiLive.isLiveActive}
          onToggleLive={live.toggleLive}
          onOpenSettings={() => live.setGeminiLiveSettingsOpen(true)}
          lastTranscript={live.geminiLive.lastTranscript}
          isBusy={isBusy}
          systemMessage={message}
          entries={chatEntries}
        />
      ) : null}

      <form onSubmit={handleSubmit} className={`relative ${embedInSheet ? "mt-3" : ""}`}>
        {layout === "stacked" ? (
          <div
            className={`flex w-full flex-col gap-2.5 rounded-[var(--radius-md)] border bg-[color:var(--surface-card)] p-3 shadow-md transition-shadow ${shellBorder}`}
          >
            <div className="flex w-full items-center justify-between gap-2">{statusBadge}</div>
            <div className="w-full min-w-0">{inputField}</div>
            <div className="flex w-full items-center gap-2">{actionButtons}</div>
          </div>
        ) : (
          <div
            className={`relative flex min-h-[2.75rem] w-full items-stretch overflow-hidden rounded-[var(--radius-md)] border shadow-md transition-shadow ${shellBorder} bg-[color:var(--surface-card)]`}
          >
            <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-[color:var(--border-main)]/30 py-2 ps-2 pe-1 sm:gap-2 sm:ps-3 sm:pe-2">
              {statusBadge}
            </div>
            <div className="relative z-10 flex min-w-0 flex-1 items-center">{inputField}</div>
            <div className="relative z-10 flex shrink-0 items-center gap-1.5 py-2 pe-2 ps-1 sm:gap-2 sm:pe-3 sm:ps-2">
              {actionButtons}
            </div>
          </div>
        )}
      </form>

      {live.voiceActive && !embedInSheet ? (
        <div className="mt-2 space-y-2">
          <GeminiLivePanel
            compact
            statusLabel={statusLabel}
            voiceStatus={live.voiceStatus}
            isLiveActive={live.geminiLive.isLiveActive}
            onToggleLive={live.toggleLive}
            onOpenSettings={() => live.setGeminiLiveSettingsOpen(true)}
            lastTranscript={live.geminiLive.lastTranscript}
          />
          <button
            type="button"
            onClick={() => openWorkspaceWidget("aiHub", { tab: "chat", startLive: true })}
            className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 hover:bg-[color:var(--surface-soft)]"
          >
            {t("workspaceWidgets.omnibar.openFullLiveChat")}
          </button>
        </div>
      ) : null}

      {embedInSheet ? (
        <button
          type="button"
          onClick={() => openWorkspaceWidget("aiHub", { tab: "chat", startLive: live.voiceActive })}
          className="mt-3 min-h-[44px] w-full rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3 py-2.5 text-center text-[11px] font-bold text-[color:var(--win-accent,#6366f1)] dark:text-indigo-300"
        >
          {t("workspaceWidgets.omnibar.openFullLiveChat")}
        </button>
      ) : null}

      <OmnibarSearchDropdown
        results={searchResults} input={input} layout={layout} t={t}
        onSelect={(r) => onSelectResult?.(r)} onClearInput={() => setInput("")}
      />

      {message && layout !== "stacked" ? (
        <div className="mx-auto mt-1 max-w-2xl truncate rounded-md border border-[color:var(--border-main)]/80 bg-[color:var(--surface-card)]/90 px-3 py-1 text-center text-[10px] font-semibold text-[color:var(--foreground-muted)] shadow-sm">
          {message}
        </div>
      ) : null}

      <GeminiLiveSettingsSheet
        open={live.geminiLiveSettingsOpen}
        onClose={() => live.setGeminiLiveSettingsOpen(false)}
        value={live.geminiVoiceSettings}
        onChange={live.setGeminiVoiceSettings}
        isLiveActive={live.geminiLive.isLiveActive}
        advancedFeaturesEnabled={live.advancedFeaturesEnabled}
      />
    </div>
  );
}
