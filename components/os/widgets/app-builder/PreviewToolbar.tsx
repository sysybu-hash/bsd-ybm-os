"use client";

import { Redo2, Undo2 } from "lucide-react";
import { useI18n } from "@/components/os/system/I18nProvider";
import { OsButton } from "@/components/os/ui";

interface PreviewToolbarProps {
  title: string;
  subtitle?: string | null;
  canUndo: boolean;
  canRedo: boolean;
  index: number;
  total: number;
  onUndo: () => void;
  onRedo: () => void;
}

const PREFIX = "workspaceWidgets.appBuilder";

/**
 * Header above the App Builder preview — title, optional hint, undo/redo.
 */
export function PreviewToolbar({
  title,
  subtitle,
  canUndo,
  canRedo,
  index,
  total,
  onUndo,
  onRedo,
}: PreviewToolbarProps) {
  const { t } = useI18n();
  const showHistory = total > 0;

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-main bg-[color:var(--background-main)]/95 px-3 py-2 sm:px-4">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[color:var(--foreground-muted)]">
          {t(`${PREFIX}.previewTitle`)}
        </p>
        <p className="truncate text-sm font-semibold text-[color:var(--foreground-main)]">{title}</p>
        {subtitle ? (
          <p className="hidden text-[11px] leading-snug text-[color:var(--foreground-muted)] sm:block">{subtitle}</p>
        ) : null}
      </div>

      {showHistory ? (
        <div className="flex shrink-0 items-center gap-1.5">
          <OsButton
            variant="quiet"
            size="sm"
            disabled={!canUndo}
            icon={<Undo2 className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />}
            onClick={onUndo}
          >
            <span className="hidden sm:inline">{t(`${PREFIX}.undo`)}</span>
          </OsButton>
          <OsButton
            variant="quiet"
            size="sm"
            disabled={!canRedo}
            icon={<Redo2 className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />}
            onClick={onRedo}
          >
            <span className="hidden sm:inline">{t(`${PREFIX}.redo`)}</span>
          </OsButton>
          <span className="text-[11px] font-medium text-[color:var(--foreground-muted)]">
            {t(`${PREFIX}.versionLabel`, { current: String(index), total: String(total) })}
          </span>
        </div>
      ) : null}
    </div>
  );
}
