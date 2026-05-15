"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, RotateCcw, Save, X } from "lucide-react";
import { toast } from "sonner";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import { saveGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import {
  GEMINI_VOICE_OPTIONS,
  SPEECH_STYLE_OPTIONS,
  voiceForSpeechStyle,
} from "@/lib/gemini-live-voice-catalog";

export type GeminiLiveSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  /** ערכים נוכחיים מההורה (מסונכרן עם ההוק) */
  value: GeminiLiveVoiceSettings;
  onChange: (next: GeminiLiveVoiceSettings) => void;
  isLiveActive: boolean;
};

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)]/50 p-3 transition hover:bg-[color:var(--surface-card)]/80">
      <span className="min-w-0">
        <span className="block text-xs font-black text-[color:var(--foreground-main)]">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[10px] font-semibold text-[color:var(--foreground-muted)]">{description}</span>
        ) : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 shrink-0 rounded border-[color:var(--border-main)] text-indigo-600 focus:ring-indigo-500/40"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export default function GeminiLiveSettingsSheet({ open, onClose, value, onChange, isLiveActive }: GeminiLiveSettingsSheetProps) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<GeminiLiveVoiceSettings>(value);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleSave = () => {
    saveGeminiLiveVoiceSettings(draft);
    onChange(draft);
    toast.success("הגדרות Gemini Live נשמרו");
    if (isLiveActive) {
      toast.message("ההגדרות יחולו בחיבור הבא של העוזר הקולי");
    }
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS });
    toast.message("אופסו לברירת מחדל — לחץ «שמור» להחלה ולשמירה");
  };

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1250] bg-black/50 backdrop-blur-[2px]"
            aria-label="סגור הגדרות קול"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="gemini-live-settings-title"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[1260] max-h-[min(82dvh,720px)] overflow-hidden rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[min(480px,calc(100vw-2rem))] md:-translate-x-1/2 md:-translate-y-1/2"
            dir="rtl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
                  <Mic size={18} aria-hidden />
                </div>
                <h2 id="gemini-live-settings-title" className="truncate text-sm font-black text-[color:var(--foreground-main)]">
                  הגדרות Gemini Live
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[color:var(--foreground-muted)] transition hover:bg-[color:var(--surface-soft)]"
                aria-label="סגור"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="custom-scrollbar max-h-[min(70dvh,600px)] overflow-y-auto p-4">
              {isLiveActive ? (
                <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
                  העוזר הקולי פעיל. אחרי שמירה, ההגדרות יחולו בחיבור הבא (אפשר לכבות ולהפעיל מחדש).
                </p>
              ) : null}

              <div className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">סגנון דיבור</label>
                  <select
                    value={draft.speechStyle ?? "masculine"}
                    onChange={(e) => {
                      const speechStyle = e.target.value as GeminiLiveVoiceSettings["speechStyle"];
                      setDraft({
                        ...draft,
                        speechStyle,
                        voiceName: voiceForSpeechStyle(speechStyle),
                      });
                    }}
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
                  >
                    {SPEECH_STYLE_OPTIONS.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.labelHe}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">קול</label>
                  <select
                    value={draft.voiceName}
                    onChange={(e) => setDraft({ ...draft, voiceName: e.target.value as GeminiLiveVoiceSettings["voiceName"] })}
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
                  >
                    {GEMINI_VOICE_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.labelHe}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[10px] font-semibold text-[color:var(--foreground-muted)]">
                    {GEMINI_VOICE_OPTIONS.find((v) => v.id === draft.voiceName)?.descriptionHe ??
                      "בחר קול לעוזר הקולי"}
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
                    טמפרטורה ({draft.temperature.toFixed(2)})
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={1.5}
                    step={0.05}
                    value={draft.temperature}
                    onChange={(e) => setDraft({ ...draft, temperature: Number(e.target.value) })}
                    className="w-full accent-indigo-500"
                  />
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">שקט לפני סיום דיבור (ms)</label>
                    <input
                      type="number"
                      min={200}
                      max={3000}
                      step={50}
                      value={draft.silenceDurationMs}
                      onChange={(e) =>
                        setDraft({ ...draft, silenceDurationMs: Math.min(3000, Math.max(200, Number(e.target.value) || 1100)) })
                      }
                      className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-mono text-[color:var(--foreground-main)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">ריפוד לפני פעילות (ms)</label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      step={10}
                      value={draft.prefixPaddingMs}
                      onChange={(e) =>
                        setDraft({ ...draft, prefixPaddingMs: Math.min(1000, Math.max(0, Number(e.target.value) || 350)) })
                      }
                      className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2 text-sm font-mono text-[color:var(--foreground-main)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">מצב תגובה</label>
                  <select
                    value={draft.responseMode}
                    onChange={(e) =>
                      setDraft({ ...draft, responseMode: e.target.value as GeminiLiveVoiceSettings["responseMode"] })
                    }
                    className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
                  >
                    <option value="audio">קול בלבד</option>
                    <option value="audio_text">קול + טקסט</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <ToggleRow
                    label="תמלול קלט"
                    checked={draft.inputTranscription}
                    onChange={(v) => setDraft({ ...draft, inputTranscription: v })}
                  />
                  <ToggleRow
                    label="תמלול פלט"
                    checked={draft.outputTranscription}
                    onChange={(v) => setDraft({ ...draft, outputTranscription: v })}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[color:var(--border-main)] px-4 py-3">
              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-[11px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-300"
              >
                <RotateCcw size={14} aria-hidden />
                איפוס
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[11px] font-black text-white shadow-md transition hover:bg-indigo-500"
              >
                <Save size={14} aria-hidden />
                שמור
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
