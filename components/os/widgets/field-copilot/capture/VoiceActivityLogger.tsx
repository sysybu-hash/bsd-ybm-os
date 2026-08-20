"use client";

/**
 * VoiceActivityLogger — one-tap voice → WorkDiary entry for field workers.
 *
 * Provides a fast-path shortcut: instead of the full 5-step FieldCopilot flow,
 * a contractor can tap the mic, speak their daily log, and save it directly
 * as a WorkDiary note without picking a project or going through analysis.
 *
 * Uses Gemini Live (primary) with Web Speech API fallback.
 * Falls back gracefully when neither is supported.
 */

import React, { useState } from "react";
import { Mic, MicOff, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import { useWebSpeechFallback } from "@/hooks/useWebSpeechFallback";
import { OsButton } from "@/components/os/ui";

type Props = {
  /** API base path for work diaries, e.g. /api/projects/[id] */
  apiBase: string;
  projectName?: string | null;
  onSaved?: () => void;
};

export function VoiceActivityLogger({ apiBase, projectName, onSaved }: Props) {
  const { t, locale } = useI18n();
  const [transcript, setTranscript] = useState("");
  const [saving, setSaving] = useState(false);

  const speech = useWebSpeechFallback(
    (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
    locale === "he" ? "he-IL" : locale === "ru" ? "ru-RU" : "en-US",
  );

  const handleSave = async () => {
    const trimmed = transcript.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/work-diaries`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: trimmed,
          source: "voice",
        }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        toast.error(j.error ?? t("workspaceWidgets.fieldCopilot.diarySaveError"));
        return;
      }
      toast.success(t("workspaceWidgets.fieldCopilot.diarySaved"));
      setTranscript("");
      onSaved?.();
    } catch {
      toast.error(t("workspaceWidgets.fieldCopilot.diarySaveError"));
    } finally {
      setSaving(false);
    }
  };

  const isListening = speech.state === "listening";

  if (!speech.supported) {
    return (
      <div className="rounded-xl border border-dashed border-[color:var(--border-main)] p-3 text-center text-xs text-[color:var(--foreground-muted)]">
        {t("workspaceWidgets.fieldCopilot.speechUnsupported")}
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/40 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold">
          {projectName ? t("workspaceWidgets.fieldCopilot.voiceDiaryTitled", { project: projectName }) : t("workspaceWidgets.fieldCopilot.voiceDiaryQuick")}
        </p>
        {transcript ? (
          <OsButton
            variant="quiet"
            size="sm"
            className="text-rose-600 hover:bg-rose-50 dark:text-rose-400"
            icon={<Trash2 size={10} aria-hidden />}
            onClick={() => setTranscript("")}
          >
            {t("workspaceWidgets.fieldCopilot.clear")}
          </OsButton>
        ) : null}
      </div>

      <OsButton
        variant="primary"
        className={`relative min-h-[44px] w-full justify-center active:scale-95 ${
          isListening ? "bg-rose-600 hover:bg-rose-500" : "bg-sky-600 hover:bg-sky-500"
        }`}
        onClick={isListening ? speech.stop : speech.start}
      >
        {isListening ? (
          <>
            <span className="absolute animate-ping rounded-full bg-rose-400/40" style={{ width: 40, height: 40 }} aria-hidden />
            <MicOff size={18} aria-hidden /> {t("workspaceWidgets.fieldCopilot.stopRecording")}
          </>
        ) : (
          <><Mic size={18} aria-hidden /> {t("workspaceWidgets.fieldCopilot.recordVoiceDiary")}</>
        )}
      </OsButton>

      {speech.error ? (
        <p className="text-[10px] text-rose-500">{speech.error}</p>
      ) : null}

      {speech.interimTranscript ? (
        <p className="rounded-lg bg-sky-50/60 px-2 py-1 text-sm italic text-sky-700 dark:bg-sky-900/10 dark:text-sky-300">
          {speech.interimTranscript}
        </p>
      ) : null}

      {transcript ? (
        <>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-[color:var(--border-main)] bg-transparent px-2 py-1.5 text-sm leading-relaxed focus:outline-none focus:ring-1 focus:ring-sky-500/30"
            dir="auto"
            placeholder={t("workspaceWidgets.fieldCopilot.editBeforeSave")}
          />
          <OsButton
            variant="primary"
            className="w-full justify-center bg-emerald-600 hover:bg-emerald-500"
            disabled={!transcript.trim()}
            loading={saving}
            icon={<Save size={15} aria-hidden />}
            onClick={() => void handleSave()}
          >
            {t("workspaceWidgets.fieldCopilot.saveAsWorkDiary")}
          </OsButton>
        </>
      ) : null}
    </div>
  );
}
