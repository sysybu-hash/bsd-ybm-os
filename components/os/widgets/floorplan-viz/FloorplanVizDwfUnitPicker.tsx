"use client";

import React from "react";
import { Building2 } from "lucide-react";
import { dwfUnitKey } from "@/components/os/widgets/floorplan-viz/useDwfBuilding";
import type { DwfBuildingUnit } from "@/lib/projects/dwf-building";

type TFn = (key: string, vars?: Record<string, string>) => string;

/** Which apartment of the uploaded permit strip to draw. */
export default function FloorplanVizDwfUnitPicker({
  t,
  units,
  value,
  onChange,
  disabled,
}: {
  t: TFn;
  units: DwfBuildingUnit[];
  value: string;
  onChange: (key: string) => void;
  disabled?: boolean;
}) {
  const label = (u: DwfBuildingUnit) => {
    const vars = { unit: String(u.unit) };
    if (u.level === "upper") return t("workspaceWidgets.floorplanViz.dwfUpper", vars);
    if (u.level === "lower") return t("workspaceWidgets.floorplanViz.dwfLower", vars);
    return t("workspaceWidgets.floorplanViz.dwfUnitOption", vars);
  };
  return (
    <label className="flex items-center gap-1.5 text-[11px] font-semibold">
      <Building2 size={14} className="text-violet-600" aria-hidden />
      {t("workspaceWidgets.floorplanViz.dwfUnit")}
      <select
        className="rounded-lg border border-[color:var(--border-main)] bg-[color:var(--background-main)] px-2 py-1 text-[11px] font-normal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" disabled>
          {t("workspaceWidgets.floorplanViz.dwfNeedUnit")}
        </option>
        {units.map((u) => (
          <option key={dwfUnitKey(u)} value={dwfUnitKey(u)}>
            {label(u)}
          </option>
        ))}
      </select>
    </label>
  );
}
