"use client";

import React from "react";
import { FolderOpen, Trash2 } from "lucide-react";
import { OsIconButton } from "@/components/os/ui";
import { floorplanVizStillFilePath, type FloorplanVizRunSummary } from "@/lib/projects/floorplan-viz-ids";

type TFn = (key: string, vars?: Record<string, string>) => string;

export default function FloorplanVizLibrary({
  t,
  runs,
  activeRunId,
  disabled,
  onOpen,
  onDelete,
}: {
  t: TFn;
  runs: FloorplanVizRunSummary[];
  activeRunId?: string | null;
  disabled?: boolean;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  if (runs.length === 0) {
    return (
      <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("workspaceWidgets.floorplanViz.libraryEmpty")}</p>
    );
  }

  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {runs.map((run) => {
        const active = run.id === activeRunId;
        const thumb = run.thumbStillId ? floorplanVizStillFilePath(run.id, run.thumbStillId) : null;
        return (
          <li key={run.id}>
            <div
              className={`flex gap-2 rounded-xl border p-2 ${
                active
                  ? "border-violet-500 bg-violet-500/10"
                  : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-start"
                disabled={disabled}
                onClick={() => onOpen(run.id)}
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt=""
                    className="h-12 w-16 shrink-0 rounded-md bg-neutral-900 object-cover"
                  />
                ) : (
                  <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md bg-[color:var(--surface-soft)]">
                    <FolderOpen size={16} aria-hidden />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-bold">{run.title}</span>
                  <span className="block text-[10px] text-[color:var(--foreground-muted)]">
                    {t("workspaceWidgets.floorplanViz.stillCount", { n: String(run.stillCount) })}
                    {run.styleLabelHe ? ` · ${run.styleLabelHe}` : ""}
                    {run.projectName ? ` · ${run.projectName}` : ""}
                  </span>
                </span>
              </button>
              <OsIconButton
                label={t("workspaceWidgets.floorplanViz.deleteRun")}
                size="sm"
                disabled={disabled}
                onClick={() => onDelete(run.id)}
              >
                <Trash2 size={14} />
              </OsIconButton>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
