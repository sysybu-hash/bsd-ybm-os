"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Mic, Send, SlidersHorizontal, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS, useGeminiLiveAudio } from "@/hooks/useGeminiLiveAudio";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { useOsAssistant } from "@/hooks/use-os-assistant";
import { useAutomationRunnerContext } from "@/components/os/AutomationRunnerContext";
import type { OsAssistantToolDeps } from "@/lib/os-assistant/tool-handler";
import { formatGeminiLiveUserMessage } from "@/lib/gemini-live-user-message";
import { loadGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import type { WidgetType } from "@/hooks/use-window-manager";
import GeminiLiveSettingsSheet from "@/components/os/GeminiLiveSettingsSheet";
import { useI18n } from "@/components/os/system/I18nProvider";

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

const visualizerHeights = [10, 16, 8, 22, 14, 18, 9, 20, 12, 24, 11, 19, 15, 21, 8, 17];

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
}: OmnibarProps) {
  const { t, dir } = useI18n();
  const { data: session } = useSession();
  const automationCtx = useAutomationRunnerContext();
  const assistantToolDeps =
    assistantToolDepsProp ?? automationCtx?.assistantToolDeps ?? { openWidget: openWorkspaceWidget };
  const [input, setInput] = useState("");
  const [geminiLiveSettingsOpen, setGeminiLiveSettingsOpen] = useState(false);
  const [geminiVoiceSettings, setGeminiVoiceSettings] = useState<GeminiLiveVoiceSettings>(DEFAULT_GEMINI_LIVE_VOICE_SETTINGS);
  const [voiceStatus, setVoiceStatus] = useState<"idle" | "connecting" | "listening" | "speaking" | "error">("idle");

  useEffect(() => {
    setGeminiVoiceSettings(loadGeminiLiveVoiceSettings());
  }, []);

  const osAssistant = useOsAssistant(assistantToolDeps);

  const geminiLive = useGeminiLiveAudio({
    enabled: Boolean(session?.user?.id && session?.user?.organizationId),
    settings: geminiVoiceSettings,
    systemInstruction: osAssistant.systemInstructionVoice,
    onToolCall: osAssistant.onToolCall,
    onError: (err) => {
      const friendly = formatGeminiLiveUserMessage(err);
      toast.error(friendly);
      if (process.env.NODE_ENV === "development") {
        console.warn("Gemini Live:", err);
      }
      setVoiceStatus("error");
    },
  });

  useEffect(() => {
    if (geminiLive.state === "connecting") setVoiceStatus("connecting");
    else if (geminiLive.state === "streaming") setVoiceStatus(geminiLive.isSpeaking ? "speaking" : "listening");
    else if (geminiLive.state === "ready") setVoiceStatus("listening");
    else if (geminiLive.state === "error") setVoiceStatus("error");
    else setVoiceStatus("idle");
  }, [geminiLive.state, geminiLive.isSpeaking]);

  const statusLabel = useMemo(() => {
    if (voiceStatus === "connecting") return t("workspaceWidgets.omnibar.voiceConnecting");
    if (voiceStatus === "listening") return t("workspaceWidgets.omnibar.voiceListening");
    if (voiceStatus === "speaking") return t("workspaceWidgets.omnibar.voiceSpeaking");
    if (isBusy) return t("workspaceWidgets.omnibar.processing");
    if (typeof apiLatency === "number") return `${Math.round(apiLatency)}ms`;
    return status === "error" ? t("workspaceWidgets.omnibar.error") : t("workspaceWidgets.omnibar.ready");
  }, [apiLatency, isBusy, status, t, voiceStatus]);

  const voiceActive = voiceStatus === "listening" || voiceStatus === "speaking";

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

  return (
    <div className="relative z-50 w-full px-0 md:px-4" dir={dir}>
      <form onSubmit={handleSubmit} className="relative">
        <div
          className={`relative flex min-h-[3.25rem] w-full items-stretch overflow-hidden rounded-[var(--radius-md)] border shadow-md transition-shadow ${
            voiceActive
              ? "border-indigo-400/50 ring-2 ring-indigo-500/25"
              : "border-[color:var(--border-main)]"
          } bg-[color:var(--surface-card)]`}
        >
          <AnimatePresence>
            {voiceActive && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit] bg-indigo-500/[0.06]"
              >
                <div className="absolute bottom-0 left-0 right-0 flex h-7 items-end justify-center gap-1 px-4">
                  {visualizerHeights.map((height, i) => (
                    <motion.div
                      key={`${height}-${i}`}
                      animate={{
                        height: voiceStatus === "speaking" ? [4, height, 4] : [3, Math.max(6, height / 2), 3],
                      }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.65 + (i % 4) * 0.08,
                        ease: [0.42, 0, 0.58, 1] as const,
                      }}
                      className={`w-1 rounded-full ${voiceStatus === "speaking" ? "bg-indigo-500" : "bg-emerald-500/60"}`}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-[color:var(--border-main)]/30 py-2 pl-2 pr-1 sm:gap-2 sm:pl-3 sm:pr-2">
            <div className="flex max-w-[5.5rem] items-center gap-1.5 rounded-md border border-[color:var(--border-main)] bg-[color:var(--background-main)]/60 px-2 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] sm:max-w-[10rem] sm:gap-2 sm:px-2.5">
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  voiceStatus !== "idle"
                    ? "animate-pulse bg-indigo-500"
                    : isBusy
                      ? "animate-pulse bg-amber-400"
                      : status === "error"
                        ? "bg-rose-500"
                        : "bg-emerald-500"
                }`}
              />
              <span className="min-w-0 truncate sm:whitespace-normal">{statusLabel}</span>
            </div>
          </div>

          <div className="relative z-10 min-w-0 flex-1 flex items-center">
            <label className="sr-only" htmlFor="omnibar-command">
              {t("workspaceWidgets.omnibar.commandLabel")}
            </label>
            <input
              id="omnibar-command"
              type="text"
              value={input}
              onChange={(e) => handleInputChange(e.target.value)}
              placeholder={
                voiceStatus !== "idle"
                  ? t("workspaceWidgets.omnibar.placeholderVoice")
                  : t("workspaceWidgets.omnibar.placeholder")
              }
              className="h-full w-full min-w-0 border-0 bg-transparent px-2 py-3 text-sm font-medium text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] shadow-none outline-none ring-0 focus:ring-0 md:px-3"
              autoComplete="off"
            />
          </div>

          <div className="relative z-10 flex shrink-0 items-center gap-1.5 py-2 pr-2 pl-1 sm:gap-2 sm:pr-3 sm:pl-2">
            <button
              type="button"
              onClick={() => setGeminiLiveSettingsOpen(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)] hover:text-indigo-300"
              title={t("workspaceWidgets.omnibar.voiceSettingsTitle")}
              aria-label={t("workspaceWidgets.omnibar.voiceSettingsAria")}
              aria-expanded={geminiLiveSettingsOpen}
              aria-haspopup="dialog"
            >
              <SlidersHorizontal size={18} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => (geminiLive.isLiveActive ? geminiLive.stop() : geminiLive.start())}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition ${
                voiceStatus === "listening" || voiceStatus === "speaking"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-muted)] hover:text-[color:var(--foreground-main)]"
              }`}
              title={voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
              aria-label={voiceStatus !== "idle" ? t("workspaceWidgets.omnibar.voiceOff") : t("workspaceWidgets.omnibar.voiceOn")}
              aria-pressed={voiceStatus !== "idle"}
            >
              {voiceStatus === "connecting" ? (
                <Loader2 size={18} className="animate-spin" aria-hidden />
              ) : voiceStatus === "speaking" ? (
                <Volume2 size={18} aria-hidden />
              ) : (
                <Mic size={18} aria-hidden />
              )}
            </button>

            <button type="submit" className="quiet-button quiet-button-primary h-10 shrink-0 px-3 text-xs" aria-label={t("workspaceWidgets.omnibar.sendAria")}>
              <Send size={15} aria-hidden />
              <span className="hidden sm:inline">{t("workspaceWidgets.omnibar.send")}</span>
            </button>
          </div>
        </div>
      </form>

      {searchResults.length > 0 && input.trim() && (
        <div className="absolute bottom-full mb-3 w-[calc(100%-2rem)] overflow-hidden rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] shadow-lg">
          {searchResults.map((result, idx) => (
            <button
              key={`${result.type}-${result.name}-${idx}`}
              type="button"
              onClick={() => {
                onSelectResult?.(result);
                setInput("");
              }}
              className="flex w-full items-center justify-between border-b border-[color:var(--border-main)]/50 p-3 text-right transition last:border-0 hover:bg-[color:var(--surface-soft)]"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-md text-[10px] font-black ${
                    result.type === "contact" ? "bg-indigo-500/15 text-indigo-200" : "bg-emerald-500/15 text-emerald-300"
                  }`}
                >
                  {result.type === "contact" ? "CRM" : "PRJ"}
                </div>
                <div>
                  <div className="text-xs font-black text-[color:var(--foreground-main)]">{result.name}</div>
                  {result.taxId && <div className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.omnibar.taxId", { id: result.taxId })}</div>}
                </div>
              </div>
              {typeof result.relevance === "number" && (
                <div className="text-[10px] font-mono text-[color:var(--foreground-muted)]">{Math.round(result.relevance * 100)}%</div>
              )}
            </button>
          ))}
        </div>
      )}

      {message ? (
        <div className="mx-auto mt-2 max-w-2xl rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-4 py-2 text-center text-[11px] font-semibold text-[color:var(--foreground-muted)] shadow-sm">
          {message}
        </div>
      ) : null}

      <GeminiLiveSettingsSheet
        open={geminiLiveSettingsOpen}
        onClose={() => setGeminiLiveSettingsOpen(false)}
        value={geminiVoiceSettings}
        onChange={setGeminiVoiceSettings}
        isLiveActive={geminiLive.isLiveActive}
      />
    </div>
  );
}
