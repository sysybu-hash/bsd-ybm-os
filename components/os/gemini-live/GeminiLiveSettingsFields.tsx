"use client";

import React from "react";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { GEMINI_VOICE_OPTIONS, SPEECH_STYLE_OPTIONS, voiceForSpeechStyle } from "@/lib/gemini-live-voice-catalog";

type TFn = (key: string, params?: Record<string, string>) => string;
type DraftProps = {
  draft: GeminiLiveVoiceSettings;
  setDraft: React.Dispatch<React.SetStateAction<GeminiLiveVoiceSettings>>;
  t: TFn;
};

export function ToggleRow({
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
        className="mt-1 h-4 w-4 shrink-0 rounded border-[color:var(--border-main)] text-[color:var(--win-accent,#6366f1)] focus:ring-indigo-500/40"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

export function SpeechStyleSelect({ draft, setDraft, t }: DraftProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
        {t("geminiLive.speechStyle")}
      </label>
      <select
        value={draft.speechStyle ?? "masculine"}
        onChange={(e) => {
          const speechStyle = e.target.value as GeminiLiveVoiceSettings["speechStyle"];
          setDraft({ ...draft, speechStyle, voiceName: voiceForSpeechStyle(speechStyle) });
        }}
        className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
      >
        {SPEECH_STYLE_OPTIONS.map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.labelHe}</option>
        ))}
      </select>
    </div>
  );
}

export function VoiceSelect({ draft, setDraft, t }: DraftProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
        {t("geminiLive.voice")}
      </label>
      <select
        value={draft.voiceName}
        onChange={(e) => setDraft({ ...draft, voiceName: e.target.value as GeminiLiveVoiceSettings["voiceName"] })}
        className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
      >
        {GEMINI_VOICE_OPTIONS.map((v) => (
          <option key={v.id} value={v.id}>{v.labelHe}</option>
        ))}
      </select>
      <p className="mt-1 text-[10px] font-semibold text-[color:var(--foreground-muted)]">
        {GEMINI_VOICE_OPTIONS.find((v) => v.id === draft.voiceName)?.descriptionHe ?? t("geminiLive.voiceHint")}
      </p>
    </div>
  );
}

export function TemperatureSlider({ draft, setDraft, t }: DraftProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
        {t("geminiLive.temperature", { value: draft.temperature.toFixed(2) })}
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
  );
}

export function TimingFields({ draft, setDraft, t }: DraftProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
          {t("geminiLive.silenceMs")}
        </label>
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
        <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
          {t("geminiLive.prefixPaddingMs")}
        </label>
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
  );
}

export function ResponseModeSelect({ draft, setDraft, t }: DraftProps) {
  return (
    <div>
      <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
        {t("geminiLive.responseMode")}
      </label>
      <select
        value={draft.responseMode}
        onChange={(e) => setDraft({ ...draft, responseMode: e.target.value as GeminiLiveVoiceSettings["responseMode"] })}
        className="w-full rounded-xl border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-3 py-2.5 text-sm font-bold text-[color:var(--foreground-main)]"
      >
        <option value="audio">{t("geminiLive.responseAudio")}</option>
        <option value="audio_text">{t("geminiLive.responseAudioText")}</option>
      </select>
    </div>
  );
}
