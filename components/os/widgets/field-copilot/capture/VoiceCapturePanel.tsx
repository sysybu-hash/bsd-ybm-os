"use client";

import { Mic, MicOff, RotateCcw, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useGeminiLiveAudio } from "@/hooks/useGeminiLiveAudio";
import { getFieldCopilotLivePrompt } from "@/lib/field-copilot/instruction";

type Props = {
  transcript: string;
  onTranscript: (text: string) => void;
  onAppendTranscript: (text: string) => void;
  onClearTranscript: () => void;
};

export default function VoiceCapturePanel({ transcript, onTranscript, onAppendTranscript, onClearTranscript }: Props) {
  const { t, locale } = useI18n();
  const [liveOn, setLiveOn] = useState(false);
  const [liveBuffer, setLiveBuffer] = useState("");

  const live = useGeminiLiveAudio({
    enabled: liveOn,
    owner: "fieldCopilot",
    systemInstruction: getFieldCopilotLivePrompt(locale),
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
          <button
            type="button"
            onClick={onClearTranscript}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-rose-600 hover:bg-rose-500/10 dark:text-rose-400 transition"
            title={t("workspaceWidgets.fieldCopilot.voiceClear")}
          >
            <Trash2 size={11} />
            {t("workspaceWidgets.fieldCopilot.voiceClear")}
          </button>
        ) : null}
      </div>

      {/* Record button */}
      <div className="px-4 pb-3">
        <button
          type="button"
          onClick={toggle}
          className={`relative flex min-h-[52px] w-full items-center justify-center gap-2.5 rounded-xl font-bold text-sm transition active:scale-95 ${
            liveOn
              ? "bg-rose-600 text-white shadow-lg shadow-rose-500/25"
              : "bg-sky-600 text-white shadow-lg shadow-sky-500/20"
          }`}
        >
          {liveOn ? (
            <>
              {/* Pulse ring while recording */}
              <span className="absolute inset-0 rounded-xl animate-ping bg-rose-500/30 pointer-events-none" aria-hidden />
              <MicOff size={20} />
              {t("workspaceWidgets.fieldCopilot.voiceStop")}
            </>
          ) : (
            <>
              <Mic size={20} />
              {t("workspaceWidgets.fieldCopilot.voiceStart")}
            </>
          )}
        </button>

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
            <button
              type="button"
              onClick={() => onTranscript("")}
              className="flex items-center gap-1 rounded-lg px-1.5 py-1 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)] transition"
              title={t("workspaceWidgets.fieldCopilot.voiceResetTranscript")}
            >
              <RotateCcw size={10} />
              {t("workspaceWidgets.fieldCopilot.voiceResetTranscript")}
            </button>
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
