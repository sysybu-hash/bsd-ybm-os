"use client";

import React from "react";
import { HardHat, Loader2, Mic, Send, SlidersHorizontal, Volume2 } from "lucide-react";
import type { WidgetType } from "@/hooks/use-window-manager";
import type { VoiceStatus } from "./useOmnibarGeminiLive";

type Props = {
  layout: "inline" | "stacked";
  voiceStatus: VoiceStatus;
  voiceActive: boolean;
  rateLimitActive: boolean;
  rateLimitLabel?: string | null;
  t: (key: string) => string;
  openWorkspaceWidget: (type: WidgetType) => void;
  onOpenSettings: () => void;
  onToggleLive: () => void;
};

export function OmnibarActionButtons({
  layout, voiceStatus, voiceActive, rateLimitActive, rateLimitLabel, t,
  openWorkspaceWidget, onOpenSettings, onToggleLive,
}: Props) {
  const btnClass =
    layout === "stacked"
      ? "flex flex-1 min-h-[44px] items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] transition"
      : "flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] transition";

  return (
    <>
      <button type="button" onClick={() => openWorkspaceWidget("fieldCopilot")}
        className={`${btnClass} text-amber-600 hover:bg-amber-500/10 dark:text-amber-300`}
        title={t("workspaceWidgets.sidebar.fieldCopilot")} aria-label={t("workspaceWidgets.sidebar.fieldCopilot")}>
        <HardHat size={18} aria-hidden />
      </button>
      <button type="button" onClick={onOpenSettings}
        className={`${btnClass} text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] hover:text-indigo-700 dark:hover:text-indigo-300`}
        title={t("workspaceWidgets.omnibar.voiceSettingsTitle")} aria-label={t("workspaceWidgets.omnibar.voiceSettingsAria")}
        aria-expanded={false} aria-haspopup="dialog">
        <SlidersHorizontal size={18} aria-hidden />
      </button>
      <button type="button" onClick={onToggleLive}
        className={`${btnClass} ${voiceActive ? "border-transparent bg-[color:var(--win-accent,#6366f1)] text-white shadow-sm" : rateLimitActive ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300" : "text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"}`}
        title={rateLimitActive && voiceStatus === "idle" && rateLimitLabel ? rateLimitLabel : voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
        aria-label={voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
        aria-pressed={voiceStatus !== "idle"}>
        {voiceStatus === "connecting" ? <Loader2 size={18} className="animate-spin" aria-hidden /> : voiceStatus === "speaking" ? <Volume2 size={18} aria-hidden /> : <Mic size={18} aria-hidden />}
      </button>
      <button type="submit"
        className={`quiet-button quiet-button-primary flex min-h-[44px] items-center gap-1.5 text-xs ${layout === "stacked" ? "flex-[2] justify-center px-3" : "shrink-0 px-4"}`}
        aria-label={t("workspaceWidgets.omnibar.sendAria")}>
        <Send size={15} aria-hidden />
        <span className={layout === "stacked" ? "inline" : "hidden sm:inline"}>{t("workspaceWidgets.omnibar.send")}</span>
      </button>
    </>
  );
}
