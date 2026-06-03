"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";

interface PreviewToolbarProps {
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  total: number;
  onUndo: () => void;
  onRedo: () => void;
}

const PREFIX = "workspaceWidgets.appBuilder";

/**
 * Undo/redo bar shown above the App Builder preview, letting the user revert a
 * generation that made things worse.
 */
export function PreviewToolbar({
  canUndo,
  canRedo,
  index,
  total,
  onUndo,
  onRedo,
}: PreviewToolbarProps) {
  const { t } = useI18n();

  const btn =
    "flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:bg-[color:var(--surface-soft)] text-[color:var(--foreground-main)]";

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-main bg-[color:var(--background-main)]/90 px-3 py-2">
      <button type="button" onClick={onUndo} disabled={!canUndo} title={t(`${PREFIX}.undo`)} className={btn}>
        <Undo2 className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {t(`${PREFIX}.undo`)}
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} title={t(`${PREFIX}.redo`)} className={btn}>
        <Redo2 className="h-4 w-4 rtl:rotate-180" aria-hidden />
        {t(`${PREFIX}.redo`)}
      </button>
      <span className="ms-auto text-xs text-[color:var(--foreground-muted)]">
        {t(`${PREFIX}.versionLabel`, { current: String(index), total: String(total) })}
      </span>
    </div>
  );
}
