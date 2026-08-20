"use client";

import { Mic, MicOff, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useGeminiLiveAudio } from "@/hooks/useGeminiLiveAudio";
import { getFieldCopilotLivePrompt } from "@/lib/field-copilot/instruction";
import { OsButton } from "@/components/os/ui";

type Props = {
  transcript: string;
  onTranscript: (text: string) => void;
  onAppendTranscript: (text: string) => void;
  onClearTranscript: () => void;
  /** Custom token endpoint — defaults to the dedicated field-copilot session route */
  sessionTokenUrl?: string;
};

export default function VoiceCapturePanel({ transcript, onTranscript, onAppendTranscript, onClearTranscript, sessionTokenUrl }: Props) {
  const { t, locale } = useI18n();
  const [liveOn, setLiveOn] = useState(false);
  const [liveBuffer, setLiveBuffer] = useState("");

  const live = useGeminiLiveAudio({
    enabled: liveOn,
    owner: "fieldCopilot",
    systemInstruction: getFieldCopilotLivePrompt(locale),
    sessionTokenUrl: sessionTokenUrl ?? "/api/ai/gemini-live/field-copilot-session",
    locale,
    greetOnConnect: true,
    onUserTranscript: (text, finished) => {
      if (!finished) {
        setLiveBuffer(text);
      } else if (text.trim()) {
        setLiveBuffer("");
        onAppendTranscript(text.trim());
      }
    },
  });

  const toggle = useCallback(() => {
    if (liveOn) setLiveBuffer("");
    setLiveOn((v) => !v);
  }, [liveOn]);

  const statusText = useMemo(() => {
    if (!liveOn) return t("workspaceWidgets.fieldCopilot.voiceOff");
    return live.statusText ?? t("workspaceWidgets.fieldCopilot.voiceOn");
  }, [live.statusText, liveOn, t]);

  const isConnecting = liveOn && !live.statusText;

  return (
    <section className="rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h4 className="font-bold text-sm">{t("workspaceWidgets.fieldCopilot.voiceTitle")}</h4>
        {transcript ? (
          <OsButton
            variant="quiet"
            size="sm"
            className="text-rose-600 hover:bg-rose-500/10 dark:text-rose-400"
            icon={<Trash2 size={11} aria-hidden />}
            onClick={onClearTranscript}
          >
            {t("workspaceWidgets.fieldCopilot.voiceClear")}
          </OsButton>
        ) : null}
      </div>

      {/* Record button */}
      <div className="px-4 pb-3">
        <OsButton
          variant="primary"
          className={`relative min-h-[52px] w-full justify-center active:scale-95 ${
            liveOn
              ? "bg-rose-600 shadow-lg shadow-rose-500/25 hover:bg-rose-500"
              : "bg-sky-600 shadow-lg shadow-sky-500/20 hover:bg-sky-500"
          }`}
          onClick={toggle}
        >
          {liveOn ? (
            <>
              {/* Pulse ring while recording */}
              <span className="absolute inset-0 rounded-xl animate-ping bg-rose-500/30 pointer-events-none" aria-hidden />
              <MicOff size={20} aria-hidden />
              {t("workspaceWidgets.fieldCopilot.voiceStop")}
            </>
          ) : (
            <>
              <Mic size={20} aria-hidden />
              {t("workspaceWidgets.fieldCopilot.voiceStart")}
            </>
          )}
        </OsButton>

        {/* Status line */}
        <p className={`mt-2 text-center text-[10px] font-semibold ${liveOn ? "text-rose-500" : "text-[color:var(--foreground-muted)]"}`}>
          {isConnecting
            ? t("workspaceWidgets.fieldCopilot.voiceConnecting")
            : statusText}
        </p>

        {/* Live transcript buffer (while recording) */}
        {liveBuffer ? (
          <p className="mt-2 rounded-lg bg-sky-500/10 px-3 py-2 text-sm italic text-sky-700 dark:text-sky-300">
            {liveBuffer}
          </p>
        ) : null}
      </div>

      {/* Saved transcript — editable */}
      {transcript ? (
        <div className="border-t border-[color:var(--border-main)]/60 px-4 pb-4 pt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.fieldCopilot.voiceTranscript")}
            </span>
            <OsButton
              variant="quiet"
              size="sm"
              icon={<RotateCcw size={10} aria-hidden />}
              onClick={() => onTranscript("")}
            >
              {t("workspaceWidgets.fieldCopilot.voiceResetTranscript")}
            </OsButton>
          </div>
          <textarea
            value={transcript}
            onChange={(e) => onTranscript(e.target.value)}
            rows={4}
            className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] p-3 text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-sky-500/30"
            dir="auto"
          />
        </div>
      ) : null}
    </section>
  );
}
