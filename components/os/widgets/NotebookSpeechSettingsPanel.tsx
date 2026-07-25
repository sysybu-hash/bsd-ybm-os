"use client";

import React, { useEffect, useState } from "react";
import { RotateCcw, Save, Settings2, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { OsButton } from "@/components/os/ui";
import {
  DEFAULT_NOTEBOOK_SPEECH_SETTINGS,
  listHebrewVoices,
  normalizeNotebookSpeechSettings,
  saveNotebookSpeechSettings,
  SPEECH_STYLE_OPTIONS,
  type NotebookSpeechSettings,
} from "@/lib/notebook-speech-settings";
import { useI18n } from "@/components/os/system/I18nProvider";

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
  const { t } = useI18n();
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
    toast.success(t("workspaceWidgets.settings.speechSaved"));
  };

  const handleReset = () => {
    setDraft({ ...DEFAULT_NOTEBOOK_SPEECH_SETTINGS });
    toast.message(t("workspaceWidgets.settings.speechResetHint"));
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
          <Settings2 className="h-4 w-4 text-[color:var(--win-accent,#6366f1)]" aria-hidden />
          {t("workspaceWidgets.settings.speechTitle")}
        </span>
        <span className="text-[10px] font-semibold text-[color:var(--foreground-muted)]">
          {t(expanded ? "workspaceWidgets.settings.hide" : "workspaceWidgets.settings.show")}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-3 border-t border-[color:var(--border-main)] px-3 py-3">
          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.settings.speechStyle")}</label>
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
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">{t("workspaceWidgets.settings.browserVoice")}</label>
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
              <option value="">{t("workspaceWidgets.settings.autoByStyle")}</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            {voices.length === 0 ? (
              <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-300">{t("workspaceWidgets.settings.noHebrewVoices")}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.settings.rate")} ({draft.rate.toFixed(2)})
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
              {t("workspaceWidgets.settings.pitch")} ({draft.pitch.toFixed(2)})
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
              {t("workspaceWidgets.settings.volume")} ({Math.round(draft.volume * 100)}%)
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
            <OsButton variant="secondary" size="sm" icon={<RotateCcw className="h-3 w-3" aria-hidden />} onClick={handleReset}>
              {t("workspaceWidgets.settings.reset")}
            </OsButton>
            <OsButton variant="primary" size="sm" icon={<Save className="h-3 w-3" aria-hidden />} onClick={handleSave}>
              {t("workspaceWidgets.settings.save")}
            </OsButton>
            {onPreview ? (
              <OsButton variant="secondary" size="sm" icon={<Volume2 className="h-3 w-3" aria-hidden />} onClick={onPreview}>
                {t("workspaceWidgets.settings.preview")}
              </OsButton>
            ) : null}
          </div>
          {previewSnippet ? (
            <p className="text-[10px] leading-relaxed text-[color:var(--foreground-muted)]">
              {t("workspaceWidgets.settings.previewLabel")}: «{previewSnippet.slice(0, 80)}
              {previewSnippet.length > 80 ? "…" : ""}»
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
