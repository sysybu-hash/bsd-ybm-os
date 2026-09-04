"use client";

import React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { FloorplanLayout, FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { useIsMounted } from "@/hooks/use-is-mounted";
import { OS_MODAL_PANEL_Z } from "@/lib/os-modal-z-index";
import FloorplanVizResults from "@/components/os/widgets/floorplan-viz/FloorplanVizResults";

const VIZ_MODAL_Z = OS_MODAL_PANEL_Z + 20;

type FloorplanVizModalProps = {
  t: (key: string, vars?: Record<string, string>) => string;
  loading: boolean;
  error: string | null;
  layout: FloorplanLayout | null;
  images: FloorplanVizImage[];
  enginesUsed: string[];
  ocrEngines: string[];
  visionEngines: string[];
  projectId?: string;
  projectName?: string;
  sourceFile?: File | null;
  onClose: () => void;
};

export default function FloorplanVizModal({
  t,
  loading,
  error,
  layout,
  images,
  enginesUsed,
  ocrEngines,
  visionEngines,
  projectId,
  projectName,
  sourceFile,
  onClose,
}: FloorplanVizModalProps) {
  const mounted = useIsMounted();
  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-sm"
      style={{ zIndex: VIZ_MODAL_Z }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="floorplan-viz-title"
    >
      <div className="flex h-full max-h-[min(92vh,calc(100dvh-2rem))] w-full max-w-5xl flex-col rounded-2xl border border-[color:var(--border-main)] bg-[color:var(--background-main)] shadow-2xl">
        <div className="flex items-start gap-2 border-b border-[color:var(--border-main)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 id="floorplan-viz-title" className="text-sm font-bold">{t("projectDashboard.vizTitle")}</h2>
            <p className="text-[10px] text-[color:var(--foreground-muted)]">{t("projectDashboard.vizSubtitle")}</p>
          </div>
          {enginesUsed.length > 0 ? (
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2 py-0.5 text-[9px] text-indigo-700 dark:text-indigo-300">
              {enginesUsed.join(" • ")}
            </span>
          ) : null}
          <button type="button" className="rounded-lg p-1.5 hover:bg-[color:var(--surface-elevated)]" onClick={onClose} aria-label={t("projectDashboard.cancel")}>
            <X size={16} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <FloorplanVizResults
            t={t}
            loading={loading}
            error={error}
            layout={layout}
            images={images}
            enginesUsed={enginesUsed}
            ocrEngines={ocrEngines}
            visionEngines={visionEngines}
            projectId={projectId}
            projectName={projectName}
            sourceFile={sourceFile}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
