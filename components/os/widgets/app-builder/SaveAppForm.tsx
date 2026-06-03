"use client";

import { Share2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

const PREFIX = "workspaceWidgets.appBuilder";

interface SaveAppFormProps {
  appName: string;
  appDescription: string;
  isEditing: boolean;
  readOnlyLoaded: boolean;
  shareIdea: boolean;
  sharingIdea?: boolean;
  saving: boolean;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onShareIdeaChange: (value: boolean) => void;
  onShareNow?: () => void;
  onSave: () => void;
}

/** The name/description/save form shown once a preview schema exists. */
export function SaveAppForm({
  appName,
  appDescription,
  isEditing,
  readOnlyLoaded,
  shareIdea,
  sharingIdea = false,
  saving,
  onNameChange,
  onDescriptionChange,
  onShareIdeaChange,
  onShareNow,
  onSave,
}: SaveAppFormProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-2 border-t border-[color:var(--border-main)] pt-4">
      {isEditing ? (
        <p className="text-[10px] font-medium text-indigo-300">
          {readOnlyLoaded ? t(`${PREFIX}.globalAppReadOnly`) : t(`${PREFIX}.editingApp`)}
        </p>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t(`${PREFIX}.appNameLabel`)}</span>
        <input type="text" value={appName} onChange={(e) => onNameChange(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1.5 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium">{t(`${PREFIX}.appDescriptionLabel`)}</span>
        <input type="text" value={appDescription} onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-card)] px-2.5 py-1.5 text-sm" />
      </label>
      {!isEditing ? (
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2">
          <input type="checkbox" checked={shareIdea} onChange={(e) => onShareIdeaChange(e.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 accent-indigo-500" />
          <span className="flex flex-col gap-0.5">
            <span className="text-xs font-medium text-[color:var(--foreground-main)]">{t(`${PREFIX}.shareIdeaLabel`)}</span>
            <span className="text-[10px] text-[color:var(--foreground-muted)]">{t(`${PREFIX}.shareIdeaHint`)}</span>
          </span>
        </label>
      ) : onShareNow && !readOnlyLoaded ? (
        <button
          type="button"
          onClick={onShareNow}
          disabled={sharingIdea}
          className="flex items-center justify-center gap-1.5 rounded-lg border border-indigo-500/20 bg-indigo-500/5 px-3 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/15 disabled:opacity-60"
        >
          <Share2 size={12} aria-hidden />
          {sharingIdea ? "שולח…" : t(`${PREFIX}.shareIdeaLabel`)}
        </button>
      ) : null}
      <button type="button" onClick={onSave} disabled={saving || readOnlyLoaded}
        className={`w-full rounded-lg px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${isEditing ? "bg-indigo-600 text-white hover:bg-indigo-500" : "border border-indigo-500/40 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20"}`}>
        {saving ? t(`${PREFIX}.saving`) : isEditing ? t(`${PREFIX}.updateApp`) : t(`${PREFIX}.saveApp`)}
      </button>
    </div>
  );
}
