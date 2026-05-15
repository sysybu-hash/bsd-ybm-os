"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw, Save, Settings2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import {
  DEFAULT_NOTEBOOK_SPEECH_SETTINGS,
  listHebrewVoices,
  normalizeNotebookSpeechSettings,
  saveNotebookSpeechSettings,
  SPEECH_STYLE_OPTIONS,
  type NotebookSpeechSettings,
} from "@/lib/notebook-speech-settings";

type Props = {
  settings: NotebookSpeechSettings;
  onChange: (next: NotebookSpeechSettings) => void;
  onPreview?: () => void;
  previewSnippet?: string;
};

export default function NotebookSpeechSettingsPanel({
  settings,
  onChange,
  onPreview,
  previewSnippet,
}: Props) {
  const [draft, setDraft] = useState(settings);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  useEffect(() => {
    const load = () => setVoices(listHebrewVoices());
    load();
    if (typeof window !== "undefined") {
      window.speechSynthesis.addEventListener("voiceschanged", load);
      return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
    }
  }, []);

  const handleSave = () => {
    const normalized = normalizeNotebookSpeechSettings(draft);
    saveNotebookSpeechSettings(normalized);
    onChange(normalized);
    toast.success("הגדרות הדיבור נשמרו");
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS });
    toast.message("אופסו לברירת מחדל — לחץ «שמור»");
  };

  return (
    <div className="rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/60">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-xs font-bold text-[color:var(--foreground-main)]">
          <Settings2 className="h-4 w-4 text-indigo-500" aria-hidden />
          הגדרות סגנון דיבור
        </span>
        <span className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">
          {expanded ? "הסתר" : "הצג"}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-[color:var(--border-main)] px-3 py-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">סגנון דיבור</label>
            <select
              value={draft.speechStyle}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  speechStyle: e.target.value as NotebookSpeechSettings["speechStyle"],
                  voiceURI: null,
                })
              }
              className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
            >
              {SPEECH_STYLE_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.labelHe}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">קול (דפדפן)</label>
            <select
              value={draft.voiceURI ?? ""}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  voiceURI: e.target.value ? e.target.value : null,
                })
              }
              className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-2 text-xs font-bold text-[color:var(--foreground-main)]"
            >
              <option value="">אוטומטי לפי סגנון</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {voices.length === 0 ? (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-300">לא נמצאו קולות עברית — ישמש קול ברירת מחדל.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
              מהירות ({draft.rate.toFixed(2)})
            </label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={draft.rate}
              onChange={(e) => setDraft({ ...draft, rate: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
              גובה צליל ({draft.pitch.toFixed(2)})
            </label>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={draft.pitch}
              onChange={(e) => setDraft({ ...draft, pitch: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
              עוצמה ({Math.round(draft.volume * 100)}%)
            </label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={draft.volume}
              onChange={(e) => setDraft({ ...draft, volume: Number(e.target.value) })}
              className="w-full accent-indigo-500"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-1 rounded-lg border border-[color:var(--border-main)] px-2.5 py-1.5 text-[10px] font-bold text-[color:var(--foreground-muted)] hover:bg-[color:var(--surface-soft)]"
            >
              <RotateCcw className="h-3 w-3" aria-hidden />
              איפוס
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-500"
            >
              <Save className="h-3 w-3" aria-hidden />
              שמור
            </button>
            {onPreview ? (
              <button
                type="button"
                onClick={onPreview}
                className="inline-flex items-center gap-1 rounded-lg border border-teal-500/30 bg-teal-500/10 px-2.5 py-1.5 text-[10px] font-bold text-teal-700 dark:text-teal-300"
              >
                <Volume2 className="h-3 w-3" aria-hidden />
                תצוגה מקדימה
              </button>
            ) : null}
          </div>
          {previewSnippet ? (
            <p className="text-[10px] leading-relaxed text-[color:var(--foreground-muted)]">
              תצוגה מקדימה: «{previewSnippet.slice(0, 80)}
              {previewSnippet.length > 80 ? "…" : ""}»
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
