"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  AlignLeft,
  Bot,
  BrainCircuit,
  FileDown,
  FilePlus,
  FileText,
  Loader2,
  Mic,
  Pause,
  Play,
  Send,
  Square,
} from "lucide-react";
import type { UIMessage } from "ai";
import type { WidgetType } from "@/hooks/use-window-manager";
import { visibleTextFromUIMessage } from "@/lib/ai/ui-message-text";
import NotebookSpeechSettingsPanel from "@/components/os/widgets/NotebookSpeechSettingsPanel";
import type { NotebookSpeechSettings } from "@/lib/notebook-speech-settings";

type NotebookChatPanelProps = {
  messages: UIMessage[];
  isLoading: boolean;
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onQuickAction: (prompt: string) => void;
  audioScript: string | null;
  isPlaying: boolean;
  isPaused: boolean;
  progress: number;
  speechSettings: NotebookSpeechSettings;
  setSpeechSettings: (s: NotebookSpeechSettings) => void;
  onPlay: (script: string) => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  isGeneratingAudio: boolean;
  onVoiceOverview: () => void;
  issuePromptOpen: boolean;
  setIssuePromptOpen: (v: boolean) => void;
  isIssuingDocument: boolean;
  issuedDocumentText: string | null;
  onDownloadIssued: () => void;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
  t: (key: string) => string;
};

export function NotebookChatPanel({
  messages,
  isLoading,
  input,
  setInput,
  onSubmit,
  onQuickAction,
  audioScript,
  isPlaying,
  isPaused,
  progress,
  speechSettings,
  setSpeechSettings,
  onPlay,
  onPause,
  onResume,
  onStop,
  isGeneratingAudio,
  onVoiceOverview,
  isIssuingDocument,
  setIssuePromptOpen,
  issuedDocumentText,
  onDownloadIssued,
  openWorkspaceWidget,
  t,
}: NotebookChatPanelProps) {
  return (
    <div className="relative flex h-full w-full flex-col md:w-2/3">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/30 px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-indigo-600 shadow-md">
          <Bot className="h-4 w-4 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-[color:var(--foreground-main)]">סטודיו מחקר AI</h3>
          <p className="text-xs text-[color:var(--foreground-muted)]">Gemini 2.5 Flash</p>
        </div>
      </div>

      {/* Audio overview bar */}
      {audioScript ? (
        <motion.div className="space-y-3 border-b border-[color:var(--border-main)] bg-indigo-500/5 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300">סקירה קולית</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {!isPlaying && !isPaused ? (
                <button type="button" onClick={() => onPlay(audioScript)} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-500">
                  <Play className="h-3 w-3" aria-hidden /> השמע
                </button>
              ) : null}
              {isPlaying ? (
                <button type="button" onClick={onPause} className="flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-200">
                  <Pause className="h-3 w-3" aria-hidden /> השהה
                </button>
              ) : null}
              {isPaused ? (
                <button type="button" onClick={onResume} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500">
                  <Play className="h-3 w-3" aria-hidden /> המשך
                </button>
              ) : null}
              {isPlaying || isPaused ? (
                <button type="button" onClick={onStop} className="flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1 text-[10px] font-bold text-[color:var(--foreground-main)]">
                  <Square className="h-3 w-3" aria-hidden /> עצור
                </button>
              ) : null}
            </div>
          </div>
          {(isPlaying || isPaused) && audioScript.length > 0 ? (
            <div className="space-y-1">
              <div className="h-1.5 overflow-hidden rounded-full bg-[color:var(--surface-soft)]">
                <div className="h-full rounded-full bg-indigo-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">{isPaused ? "מושהה" : "מנגן"} · {progress}%</p>
            </div>
          ) : null}
          <NotebookSpeechSettingsPanel
            settings={speechSettings}
            onChange={setSpeechSettings}
            onPreview={() => onPlay("שלום, כך נשמעת הסקירה הקולית שלך במחברת BSD-YBM.")}
            previewSnippet="שלום, כך נשמעת הסקירה הקולית שלך במחברת BSD-YBM."
          />
          <p className="max-h-24 overflow-y-auto text-xs leading-relaxed whitespace-pre-wrap text-[color:var(--foreground-muted)]">{audioScript}</p>
        </motion.div>
      ) : null}

      {/* Messages */}
      <div className="custom-scrollbar flex-1 min-h-0 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-[color:var(--foreground-muted)]">
            <Bot className="mb-4 h-14 w-14 opacity-20" />
            <p>שאל שאלות על המסמכים שהעלית.</p>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-2xl p-3 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "rounded-br-sm bg-indigo-600 text-white"
                    : "rounded-bl-sm border border-[color:var(--border-main)] bg-[color:var(--surface-card)] text-[color:var(--foreground-main)]"
                }`}
              >
                <div className="whitespace-pre-wrap">{visibleTextFromUIMessage(m)}</div>
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div className="flex justify-end">
            <div className="flex gap-1 rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3">
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: "0.15s" }} />
              <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        )}
      </div>

      {/* Action bar + input */}
      <div className="border-t border-[color:var(--border-main)] bg-[color:var(--surface-soft)]/40 p-3">
        <div className="custom-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1">
          <button type="button" disabled={isGeneratingAudio} onClick={onVoiceOverview}
            className="flex shrink-0 items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1.5 text-xs font-medium text-indigo-600 transition hover:bg-indigo-500/20 disabled:opacity-50 dark:text-indigo-300">
            {isGeneratingAudio ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
            סקירה קולית
          </button>
          <button type="button" onClick={() => onQuickAction("סכם את המקורות לתקציר מנהלים בנקודות קצרות.")}
            className="flex shrink-0 items-center gap-2 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-medium text-teal-700 transition hover:bg-teal-500/20 dark:text-teal-300">
            <AlignLeft className="h-3 w-3" /> תקציר
          </button>
          <button type="button" onClick={() => onQuickAction("צור מפת חשיבה היררכית של הרעיונות המרכזיים.")}
            className="flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-1.5 text-xs font-medium text-[color:var(--foreground-main)] hover:bg-[color:var(--surface-soft)]">
            <BrainCircuit className="h-3 w-3" /> מפת חשיבה
          </button>
          <button type="button" disabled={isIssuingDocument} onClick={() => setIssuePromptOpen(true)}
            className="flex shrink-0 items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-800 transition hover:bg-amber-500/20 disabled:opacity-50 dark:text-amber-200">
            {isIssuingDocument ? <Loader2 className="h-3 w-3 animate-spin" /> : <FilePlus className="h-3 w-3" />}
            {t("workspaceWidgets.notebookLM.issueDocument")}
          </button>
          {issuedDocumentText ? (
            <button type="button" onClick={onDownloadIssued}
              className="flex shrink-0 items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-800 dark:text-emerald-200">
              <FileDown className="h-3 w-3" />
              {t("workspaceWidgets.notebookLM.downloadIssued")}
            </button>
          ) : null}
          {issuedDocumentText && openWorkspaceWidget ? (
            <button type="button"
              onClick={() => openWorkspaceWidget("docCreator", { notebookFreeformDraft: issuedDocumentText, prompt: issuedDocumentText.slice(0, 500) })}
              className="flex shrink-0 items-center gap-2 rounded-full border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-1.5 text-xs font-medium">
              <FileText className="h-3 w-3" />
              {t("workspaceWidgets.notebookLM.openInDocCreator")}
            </button>
          ) : null}
        </div>
        <form onSubmit={onSubmit} className="relative flex items-center">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="הקלד שאלה..."
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] py-2.5 pl-12 pr-4 text-sm text-[color:var(--foreground-main)] placeholder:text-[color:var(--foreground-muted)] focus:border-indigo-500 focus:outline-none"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !input.trim()}
            className="absolute left-2 rounded-lg bg-indigo-600 p-2 text-white hover:bg-indigo-500 disabled:opacity-50">
            <Send className="h-4 w-4 rtl:-scale-x-100" />
          </button>
        </form>
      </div>
    </div>
  );
}
