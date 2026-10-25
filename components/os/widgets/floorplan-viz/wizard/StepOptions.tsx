"use client";

import React, { useState } from "react";
import { Building2, Home } from "lucide-react";
import { OsButton } from "@/components/os/ui";
import FloorplanVizBuildingBooklet from "@/components/os/widgets/floorplan-viz/FloorplanVizBuildingBooklet";
import FloorplanVizDwfUnitPicker from "@/components/os/widgets/floorplan-viz/FloorplanVizDwfUnitPicker";
import FloorplanVizHouseBooklet from "@/components/os/widgets/floorplan-viz/FloorplanVizHouseBooklet";
import FloorplanVizStylePicker from "@/components/os/widgets/floorplan-viz/FloorplanVizStylePicker";
import ScopePicker from "@/components/os/widgets/floorplan-viz/wizard/ScopePicker";
import type { VizAccess } from "@/components/os/widgets/floorplan-viz/useFloorplanVizRun";
import type { DwfBuildingUnit } from "@/lib/projects/dwf-building";
import type { FloorplanVizScope } from "@/lib/projects/floorplan-viz-scope";
import type { FloorplanVizStyleId, FloorplanVizStyleKit } from "@/lib/projects/floorplan-viz-styles";
import type { StructureKind } from "@/lib/validation/schemas/floorplan-structure";

type TFn = (key: string, vars?: Record<string, string>) => string;

export type StepOptionsProps = {
  t: TFn;
  structure: StructureKind;
  access: VizAccess | null;
  loading: boolean;
  scope: FloorplanVizScope;
  onScope: (scope: FloorplanVizScope) => void;
  styleId: FloorplanVizStyleId;
  onStyleId: (id: FloorplanVizStyleId) => void;
  customKit: FloorplanVizStyleKit | null;
  onCustomKit: (kit: FloorplanVizStyleKit | null) => void;
  /** The files as uploaded, for a house's booklet. */
  files: File[];
  /** A permit strip: its drawing and its flats. */
  dwf: { drawing: File | null; units: DwfBuildingUnit[]; choice: string; setChoice: (key: string) => void };
  projectId?: string;
  onGenerate: (renderMode: "render3d" | "finish") => void;
  onBack: () => void;
};

/** Step 3: the options that fit the structure confirmed, and the way to produce it. */
export default function StepOptions(p: StepOptionsProps) {
  const { t } = p;
  const w = (key: string) => t(`workspaceWidgets.floorplanViz.wizard.${key}`);
  const [buildingMode, setBuildingMode] = useState<"whole" | "one">("whole");
  const back = (
    <OsButton variant="quiet" size="sm" onClick={p.onBack}>
      {w("back")}
    </OsButton>
  );

  if (p.structure === "site" || p.structure === "unknown") {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-[color:var(--border-main)] px-3 py-3 text-[11px] text-[color:var(--foreground-muted)]">
          {p.structure === "site" ? w("siteNotYet") : w("noFloor")}
        </p>
        {back}
      </div>
    );
  }

  if (p.structure === "house") {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-1.5 text-[11px] text-[color:var(--foreground-muted)]">
          <Home size={14} aria-hidden />
          {w("houseHint")}
        </p>
        <FloorplanVizHouseBooklet
          t={t}
          paint={p.access?.paint === true}
          contactEmail={p.access?.contactEmail ?? ""}
          subscriber={p.access?.subscriber === true}
          initialFiles={p.files}
        />
        {back}
      </div>
    );
  }

  const flatRun = p.structure === "apartment" || p.structure === "commercial" || buildingMode === "one";
  const needsUnit = p.structure === "building" && buildingMode === "one";
  const ready = !p.loading && p.access?.subscriber === true && (!needsUnit || Boolean(p.dwf.choice));

  return (
    <div className="space-y-4">
      {p.structure === "building" ? (
        <div role="radiogroup" className="grid gap-2 sm:grid-cols-2">
          {(["whole", "one"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={buildingMode === mode}
              onClick={() => setBuildingMode(mode)}
              className={`rounded-xl border px-3 py-2 text-start ${
                buildingMode === mode ? "border-violet-500 bg-violet-500/10" : "border-[color:var(--border-main)] bg-[color:var(--background-main)]"
              }`}
            >
              <span className="flex items-center gap-1.5 text-[11px] font-bold">
                <Building2 size={14} aria-hidden />
                {w(mode === "whole" ? "buildingWhole" : "buildingOne")}
              </span>
              <span className="mt-0.5 block text-[10px] text-[color:var(--foreground-muted)]">
                {w(mode === "whole" ? "buildingWholeHint" : "buildingOneHint")}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      {p.structure === "building" && buildingMode === "whole" && p.dwf.drawing ? (
        <FloorplanVizBuildingBooklet key={p.dwf.drawing.name} t={t} drawing={p.dwf.drawing} projectId={p.projectId} />
      ) : null}

      {needsUnit && p.dwf.units.length > 0 ? (
        <FloorplanVizDwfUnitPicker t={t} units={p.dwf.units} value={p.dwf.choice} onChange={p.dwf.setChoice} disabled={p.loading} />
      ) : null}

      {flatRun ? (
        <>
          {p.structure === "commercial" ? (
            <p className="text-[11px] text-[color:var(--foreground-muted)]">{w("commercialHint")}</p>
          ) : null}
          <ScopePicker t={t} scope={p.scope} onScope={p.onScope} disabled={p.loading} />
          <FloorplanVizStylePicker
            t={t}
            styleId={p.styleId}
            onStyleId={p.onStyleId}
            customKit={p.customKit}
            onCustomKit={p.onCustomKit}
            disabled={p.loading}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            {back}
            <div className="flex gap-2">
              {p.access?.paint ? (
                <OsButton variant="secondary" size="sm" loading={p.loading} disabled={!ready} onClick={() => p.onGenerate("finish")}>
                  {t("workspaceWidgets.floorplanViz.paintAction")}
                </OsButton>
              ) : null}
              <OsButton variant="primary" size="sm" loading={p.loading} disabled={!ready} onClick={() => p.onGenerate("render3d")}>
                {p.scope === "full" ? t("workspaceWidgets.floorplanViz.generateFull") : t("workspaceWidgets.floorplanViz.generateOverview")}
              </OsButton>
            </div>
          </div>
        </>
      ) : (
        back
      )}
    </div>
  );
}
