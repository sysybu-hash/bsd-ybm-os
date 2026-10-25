"use client";

import React from "react";
import { Ban, DoorOpen } from "lucide-react";
import type { IdentifiedPlan } from "@/lib/validation/schemas/floorplan-structure";

type TFn = (key: string, vars?: Record<string, string>) => string;

const fmt = (n: number) => Math.round(n).toLocaleString("he-IL");

/** One plan the file holds: its preview and what was measured of it. A blocked plan says why and cannot be chosen. */
export default function PlanCard({
  t,
  plan,
  index,
  selected,
  selectable,
  onSelect,
}: {
  t: TFn;
  plan: IdentifiedPlan;
  index: number;
  selected: boolean;
  selectable: boolean;
  onSelect: () => void;
}) {
  const blocked = Boolean(plan.blocked);
  const pickable = selectable && !blocked && plan.kind === "floor";
  const title = plan.title || t("workspaceWidgets.floorplanViz.wizard.planUntitled", { n: String(index + 1) });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-disabled={!pickable}
      disabled={!pickable}
      onClick={onSelect}
      className={`flex flex-col overflow-hidden rounded-xl border text-start transition ${
        selected
          ? "border-violet-500 ring-2 ring-violet-500/30"
          : blocked
            ? "border-red-500/40 opacity-80"
            : "border-[color:var(--border-main)]"
      } ${pickable ? "hover:border-violet-400" : "cursor-default"}`}
    >
      <span className="block aspect-[4/3] w-full bg-white">
        {plan.preview ? (
          // A data URL the server drew; next/image cannot optimise it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={plan.preview} alt={title} className="h-full w-full object-contain" />
        ) : null}
      </span>
      <span className="block space-y-0.5 px-2.5 py-2">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-bold">{title}</span>
          <span className="shrink-0 rounded-full bg-[color:var(--surface-soft)] px-1.5 py-0.5 text-[9px]">
            {t(`workspaceWidgets.floorplanViz.wizard.planKinds.${plan.kind}`)}
          </span>
        </span>
        <span className="block text-[10px] text-[color:var(--foreground-muted)]">
          {plan.widthM > 0
            ? t("workspaceWidgets.floorplanViz.wizard.planSize", { w: fmt(plan.widthM), h: fmt(plan.heightM) })
            : null}
          {plan.closedM2 != null ? ` · ${t("workspaceWidgets.floorplanViz.wizard.planClosed", { m2: fmt(plan.closedM2) })}` : null}
        </span>
        {plan.doors != null || plan.units?.length ? (
          <span className="flex items-center gap-1 text-[10px] text-[color:var(--foreground-muted)]">
            {plan.doors != null ? (
              <>
                <DoorOpen size={11} aria-hidden />
                {t("workspaceWidgets.floorplanViz.wizard.planDoors", { n: String(plan.doors) })}
              </>
            ) : null}
            {plan.units?.length
              ? ` ${t("workspaceWidgets.floorplanViz.wizard.planUnits", { list: plan.units.slice(0, 12).join(", ") })}`
              : null}
          </span>
        ) : null}
        {blocked ? (
          <span className="flex items-start gap-1 text-[10px] text-red-700 dark:text-red-300">
            <Ban size={11} className="mt-0.5 shrink-0" aria-hidden />
            {plan.blocked}
          </span>
        ) : null}
      </span>
    </button>
  );
}
