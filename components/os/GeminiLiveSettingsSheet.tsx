"use client";

import React, { useEffect, useState } from "react";
import { Mic, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { useI18n } from "@/components/os/system/I18nProvider";
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

export default function GeminiLiveSettingsSheet({
  open,
  onClose,
  value,
  onChange,
  isLiveActive,
}: GeminiLiveSettingsSheetProps) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<GeminiLiveVoiceSettings>(value);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const handleSave = () => {
    saveGeminiLiveVoiceSettings(draft);
    onChange(draft);
    toast.success(t("geminiLive.saved"));
    if (isLiveActive) {
      toast.message(t("geminiLive.applyOnReconnect"));
    }
    onClose();
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_GEMINI_LIVE_VOICE_SETTINGS });
    toast.message(t("geminiLive.resetHint"));
  };

  return (
    <OsFloatingPanel
      open={open}
      onClose={onClose}
      title={t("geminiLive.panelTitle")}
      titleId="gemini-live-settings-title"
      panelWidth={480}
      zIndex={1260}
      headerStart={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-300">
          <Mic size={18} aria-hidden />
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-[11px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-300"
          >
            <RotateCcw size={14} aria-hidden />
            {t("geminiLive.reset")}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-[11px] font-black text-white shadow-md transition hover:bg-indigo-500"
          >
            <Save size={14} aria-hidden />
            {t("geminiLive.save")}
          </button>
        </div>
      }
    >
      {isLiveActive ? (
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-200">
          {t("geminiLive.liveActiveHint")}
        </p>
      ) : null}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
            {t("geminiLive.speechStyle")}
          </label>
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

        <VoiceSelect draft={draft} setDraft={setDraft} t={t} />
        <TemperatureSlider draft={draft} setDraft={setDraft} t={t} />
        <TimingFields draft={draft} setDraft={setDraft} t={t} />
        <ResponseModeSelect draft={draft} setDraft={setDraft} t={t} />

        <div className="space-y-2">
          <ToggleRow
            label={t("geminiLive.inputTranscription")}
            checked={draft.inputTranscription}
            onChange={(v) => setDraft({ ...draft, inputTranscription: v })}
          />
          <ToggleRow
            label={t("geminiLive.outputTranscription")}
            checked={draft.outputTranscription}
            onChange={(v) => setDraft({ ...draft, outputTranscription: v })}
          />
        </div>
      </div>
    </OsFloatingPanel>
  );
}

function VoiceSelect({
  draft,
  setDraft,
  t,
}: {
  draft: GeminiLiveVoiceSettings;
  setDraft: React.Dispatch<React.SetStateAction<GeminiLiveVoiceSettings>>;
  t: (key: string, params?: Record<string, string>) => string;
}) {
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
          <option key={v.id} value={v.id}>
            {v.labelHe}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[10px] font-semibold text-[color:var(--foreground-muted)]">
        {GEMINI_VOICE_OPTIONS.find((v) => v.id === draft.voiceName)?.descriptionHe ?? t("geminiLive.voiceHint")}
      </p>
    </div>
  );
}

function TemperatureSlider({
  draft,
  setDraft,
  t,
}: {
  draft: GeminiLiveVoiceSettings;
  setDraft: React.Dispatch<React.SetStateAction<GeminiLiveVoiceSettings>>;
  t: (key: string, params?: Record<string, string>) => string;
}) {
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

function TimingFields({
  draft,
  setDraft,
  t,
}: {
  draft: GeminiLiveVoiceSettings;
  setDraft: React.Dispatch<React.SetStateAction<GeminiLiveVoiceSettings>>;
  t: (key: string) => string;
}) {
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

function ResponseModeSelect({
  draft,
  setDraft,
  t,
}: {
  draft: GeminiLiveVoiceSettings;
  setDraft: React.Dispatch<React.SetStateAction<GeminiLiveVoiceSettings>>;
  t: (key: string) => string;
}) {
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
