"use client";

import React, { useEffect, useState } from "react";
import { Mic, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import OsFloatingPanel from "@/components/os/layout/OsFloatingPanel";
import { OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { GeminiLiveVoiceSettings } from "@/hooks/useGeminiLiveAudio";
import { DEFAULT_GEMINI_LIVE_VOICE_SETTINGS } from "@/hooks/useGeminiLiveAudio";
import { saveGeminiLiveVoiceSettings } from "@/lib/gemini-live-voice-settings";
import {
  ToggleRow,
  SpeechStyleSelect,
  VoiceSelect,
  TemperatureSlider,
  TimingFields,
  ResponseModeSelect,
} from "@/components/os/gemini-live/GeminiLiveSettingsFields";

export type GeminiLiveSettingsSheetProps = {
  open: boolean;
  onClose: () => void;
  value: GeminiLiveVoiceSettings;
  onChange: (next: GeminiLiveVoiceSettings) => void;
  isLiveActive: boolean;
  /** דגל פלטפורמה — מאפשר proactiveAudio / affectiveDialog */
  advancedFeaturesEnabled?: boolean;
};

export default function GeminiLiveSettingsSheet({
  open,
  onClose,
  value,
  onChange,
  isLiveActive,
  advancedFeaturesEnabled = false,
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
    if (isLiveActive) toast.message(t("geminiLive.applyOnReconnect"));
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
      zIndex={OS_MODAL_PANEL_Z}
      headerStart={
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/20 text-indigo-700 dark:text-indigo-300">
          <Mic size={18} aria-hidden />
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[color:var(--border-main)] px-3 py-2 text-[11px] font-bold text-[color:var(--foreground-muted)] transition hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
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
        <p className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-200">
          {t("geminiLive.liveActiveHint")}
        </p>
      ) : null}

      <div className="space-y-4">
        <SpeechStyleSelect draft={draft} setDraft={setDraft} t={t} />
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
          {advancedFeaturesEnabled ? (
            <>
              <ToggleRow
                label={t("geminiLive.proactiveAudio")}
                description={t("geminiLive.proactiveAudioHint")}
                checked={draft.proactiveAudio ?? false}
                onChange={(v) => setDraft({ ...draft, proactiveAudio: v })}
              />
              <ToggleRow
                label={t("geminiLive.affectiveDialog")}
                description={t("geminiLive.affectiveDialogHint")}
                checked={draft.affectiveDialog ?? false}
                onChange={(v) => setDraft({ ...draft, affectiveDialog: v })}
              />
              <ToggleRow
                label={t("geminiLive.sessionResumption")}
                description={t("geminiLive.sessionResumptionHint")}
                checked={draft.sessionResumptionEnabled ?? true}
                onChange={(v) => setDraft({ ...draft, sessionResumptionEnabled: v })}
              />
            </>
          ) : null}
        </div>
      </div>
    </OsFloatingPanel>
  );
}
