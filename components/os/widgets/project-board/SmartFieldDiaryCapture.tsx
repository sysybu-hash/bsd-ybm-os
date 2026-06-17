"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useI18n } from "@/components/os/system/I18nProvider";
import type { SiteDiaryAnalysis } from "@/lib/validation/schemas/site-diary-report";

type Props = {
  projectId: string;
  projectName?: string | null;
  taskId?: string | null;
  taskTitle?: string | null;
  compact?: boolean;
  onApplied?: () => void;
};

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export default function SmartFieldDiaryCapture({
  projectId,
  projectName,
  taskId,
  taskTitle,
  compact = false,
  onApplied,
}: Props) {
  const { t, locale } = useI18n();
  const prefix = "workspaceWidgets.projectBoard.mobileField.smartDiary";
  const inputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [preview, setPreview] = useState<SiteDiaryAnalysis | null>(null);
  const [applyTaskStatus, setApplyTaskStatus] = useState(true);

  const resetPreview = () => {
    setPreview(null);
    setApplyTaskStatus(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (file: File | null) => {
    if (!file || !file.type.startsWith("image/")) {
      toast.error(t(`${prefix}.invalidImage`));
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error(t(`${prefix}.imageTooLarge`));
      return;
    }

    setIsAnalyzing(true);
    setPreview(null);
    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch(
        `/api/projects/${encodeURIComponent(projectId)}/field-site-report`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            imageBase64,
            mimeType: file.type,
            taskId: taskId ?? undefined,
            locale,
            applyTaskStatus: taskId ? applyTaskStatus : false,
          }),
        },
      );

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(json.error ?? t(`${prefix}.analyzeFailed`));
        return;
      }

      const json = (await res.json()) as {
        analysis: SiteDiaryAnalysis;
        taskStatusUpdated?: boolean;
      };

      setPreview(json.analysis);
      toast.success(
        json.taskStatusUpdated
          ? t(`${prefix}.savedWithTask`)
          : t(`${prefix}.saved`),
      );
      onApplied?.();
    } catch {
      toast.error(t(`${prefix}.analyzeFailed`));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const label = taskTitle
    ? t(`${prefix}.captureForTask`, { task: taskTitle })
  : compact
      ? t(`${prefix}.captureShort`)
      : t(`${prefix}.capture`);

  return (
    <div
      className={
        compact
          ? ""
          : "mb-4 rounded-window border border-[color:var(--border-main)] bg-gradient-to-br from-sky-500/5 to-[color:var(--surface-card)] p-4 shadow-sm"
      }
    >
      {!compact ? (
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-sky-600 dark:text-sky-400" aria-hidden />
          <div>
            <p className="text-sm font-bold text-[color:var(--foreground-main)]">
              {t(`${prefix}.title`)}
            </p>
            {projectName ? (
              <p className="text-xs text-[color:var(--foreground-muted)]">{projectName}</p>
            ) : null}
          </div>
        </div>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
      />

      <button
        type="button"
        disabled={isAnalyzing}
        onClick={() => inputRef.current?.click()}
        className={
          compact
            ? "inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-medium text-sky-700 disabled:opacity-60 dark:text-sky-300"
            : "flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white shadow-sm transition-transform active:scale-[0.98] disabled:opacity-60"
        }
      >
        {isAnalyzing ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Camera className="h-4 w-4" aria-hidden />
        )}
        {isAnalyzing ? t(`${prefix}.analyzing`) : label}
      </button>

      {taskId && !compact && !preview ? (
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs text-[color:var(--foreground-muted)]">
          <input
            type="checkbox"
            checked={applyTaskStatus}
            onChange={(e) => setApplyTaskStatus(e.target.checked)}
          />
          {t(`${prefix}.applyTaskStatus`)}
        </label>
      ) : null}

      {preview ? (
        <div className="mt-3 rounded-lg border border-[color:var(--border-main)] bg-[color:var(--surface-soft)] p-3 text-sm">
          <p className="font-medium text-[color:var(--foreground-main)]">{preview.summary}</p>
          {preview.materialsDetected.length > 0 ? (
            <p className="mt-2 text-xs text-[color:var(--foreground-muted)]">
              {t(`${prefix}.materials`)}: {preview.materialsDetected.join(", ")}
            </p>
          ) : null}
          {preview.issues.length > 0 ? (
            <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
              {t(`${prefix}.issues`)}: {preview.issues.join("; ")}
            </p>
          ) : null}
          <button
            type="button"
            className="mt-2 text-xs font-medium text-[color:var(--brand-accent)]"
            onClick={resetPreview}
          >
            {t(`${prefix}.captureAnother`)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
