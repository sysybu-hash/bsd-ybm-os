"use client";

import React from "react";
import { Loader2, Mic, SlidersHorizontal, Volume2 } from "lucide-react";
import GeminiLiveVisualizer from "@/components/os/gemini-live/GeminiLiveVisualizer";
import { useI18n } from "@/components/os/system/I18nProvider";

const BOX = "div";

export type GeminiLivePanelProps = {
  statusLabel: string;
  voiceStatus: "idle" | "connecting" | "listening" | "speaking" | "error";
  isLiveActive: boolean;
  onToggleLive: () => void;
  onOpenSettings: () => void;
  lastTranscript?: string;
  compact?: boolean;
};

export default function GeminiLivePanel({
  statusLabel,
  voiceStatus,
  isLiveActive,
  onToggleLive,
  onOpenSettings,
  lastTranscript,
  compact = false,
}: GeminiLivePanelProps) {
  const { t } = useI18n();
  const voiceActive = voiceStatus === "listening" || voiceStatus === "speaking";

  return React.createElement(
    BOX,
    {
      className: `relative flex flex-col overflow-hidden rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] ${
        compact ? "p-3" : "p-4 min-h-[200px]"
      } ${voiceActive ? "ring-2 ring-indigo-500/25" : ""}`,
    },
    React.createElement(GeminiLiveVisualizer, {
      active: voiceActive,
      speaking: voiceStatus === "speaking",
      className: `absolute inset-x-0 bottom-0 ${compact ? "h-8" : "h-12"}`,
    }),
    React.createElement(
      BOX,
      { className: "relative z-10 flex flex-1 flex-col items-center justify-center gap-3 py-4" },
      React.createElement(
        BOX,
        { className: "flex items-center gap-2 text-[10px] font-bold text-[color:var(--foreground-muted)]" },
        React.createElement("span", {
          className: `h-1.5 w-1.5 rounded-full ${
            voiceStatus !== "idle" ? "animate-pulse bg-[color:var(--win-accent,#6366f1)]" : "bg-emerald-500"
          }`,
        }),
        React.createElement("span", null, statusLabel),
      ),
      lastTranscript
        ? React.createElement(
            "p",
            { className: "max-w-md text-center text-xs text-[color:var(--foreground-main)]" },
            lastTranscript,
          )
        : null,
      React.createElement(
        BOX,
        { className: "flex items-center gap-2" },
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onOpenSettings,
            className:
              "flex h-9 w-9 items-center justify-center rounded-lg border border-[color:var(--border-main)] text-[color:var(--foreground-muted)] hover:text-indigo-700 dark:hover:text-indigo-300",
            title: t("workspaceWidgets.omnibar.voiceSettingsTitle"),
            "aria-label": t("workspaceWidgets.omnibar.voiceSettingsAria"),
          },
          React.createElement(SlidersHorizontal, { size: 18 }),
        ),
        React.createElement(
          "button",
          {
            type: "button",
            onClick: onToggleLive,
            className: `flex h-12 w-12 items-center justify-center rounded-full transition ${
              voiceActive
                ? "bg-[color:var(--win-accent,#6366f1)] text-white shadow-lg"
                : "border border-[color:var(--border-main)] bg-[color:var(--background-main)]"
            }`,
            "aria-pressed": isLiveActive,
          },
          voiceStatus === "connecting"
            ? React.createElement(Loader2, { size: 22, className: "animate-spin" })
            : voiceStatus === "speaking"
              ? React.createElement(Volume2, { size: 22 })
              : React.createElement(Mic, { size: 22 }),
        ),
      ),
    ),
  );
}
