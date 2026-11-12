"use client";

import { useState } from "react";
import { Camera } from "lucide-react";
import type { BuildingStudioData } from "@/lib/projects/pipeline/building-studio";
import { BuildingViewer, type BuildingViewerLabels } from "@/components/vmb/studio3d/BuildingViewer";
import { SheetOverlay, type OverlayLabels } from "@/components/vmb/studio3d/SheetOverlay";

export type BuildingBenchLabels = {
  tab3d: string;
  tabSheet: string;
  camerasTitle: string;
  free: string;
  model: string;
  storeySheet: string;
  noSheet: string;
  camerasLater: string;
  viewer: BuildingViewerLabels;
  overlay: OverlayLabels;
};

/**
 * The studio of a house or a building (plan M3): each measured model in 3D at the booklet's cameras, cut by storey or
 * through the middle, and each storey's walls over that storey's sheet with their measured distance.
 */
export function BuildingWorkbench({ data, sheetSrc, labels }: { data: BuildingStudioData; sheetSrc: (key: string) => string; labels: BuildingBenchLabels }) {
  const [mi, setMi] = useState(0);
  const model = data.models[mi] ?? data.models[0]!;
  const [tab, setTab] = useState<"3d" | "sheet">("3d");
  const [active, setActive] = useState<string | null>(null);
  const [sheetKey, setSheetKey] = useState<string | null>(null);
  const camera = model.cameras.find((c) => c.id === active) ?? null;
  const sheet = model.sheets.find((s) => s.key === sheetKey) ?? model.sheets[0] ?? null;
  const storeyTitle = (id: string) => model.storeys.find((s) => s.id === id)?.title ?? id;

  const tabBtn = (id: "3d" | "sheet", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 font-semibold ${tab === id ? "bg-[color:var(--vmb-bg-raised)] shadow" : "text-[color:var(--vmb-muted)]"}`}>
      {label}
    </button>
  );
  const select = "rounded-lg border border-[color:var(--vmb-line)] bg-[color:var(--vmb-bg-raised)] px-2 py-1 text-xs";
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="vmb-card min-w-0 space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex w-fit rounded-full bg-[color:var(--vmb-bg-sunk)] p-1 text-sm" role="tablist">
            {tabBtn("3d", labels.tab3d)}
            {tabBtn("sheet", labels.tabSheet)}
          </div>
          {data.models.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs">
              {labels.model}
              <select
                className={select}
                value={mi}
                onChange={(e) => {
                  setMi(Number(e.target.value));
                  setActive(null);
                  setSheetKey(null);
                }}
              >
                {data.models.map((m, i) => (
                  <option key={i} value={i}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {tab === "sheet" && model.sheets.length > 1 ? (
            <label className="flex items-center gap-1.5 text-xs">
              {labels.storeySheet}
              <select className={select} value={sheet?.key ?? ""} onChange={(e) => setSheetKey(e.target.value)}>
                {model.sheets.map((s) => (
                  <option key={s.key} value={s.key}>
                    {storeyTitle(s.storeyId)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        {tab === "3d" ? (
          <BuildingViewer key={mi} model={model} camera={camera} labels={labels.viewer} />
        ) : sheet ? (
          <SheetOverlay key={sheet.key} src={sheetSrc(sheet.key)} sheet={sheet} overlay={sheet.overlay} labels={labels.overlay} />
        ) : (
          <p className="text-sm text-[color:var(--vmb-ink-soft)]">{labels.noSheet}</p>
        )}
      </section>
      <aside className="space-y-4">
        <section className="vmb-card space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <Camera className="h-4 w-4 text-[color:var(--vmb-accent)]" aria-hidden />
            {labels.camerasTitle}
          </h2>
          <ul className="space-y-1 text-sm">
            <li>
              <button type="button" onClick={() => { setActive(null); setTab("3d"); }} aria-pressed={active === null} className={`w-full truncate rounded-lg px-2.5 py-1.5 text-start ${active === null ? "bg-[color:var(--vmb-bg-sunk)] font-semibold" : "hover:bg-[color:var(--vmb-bg-sunk)]"}`}>
                {labels.free}
              </button>
            </li>
            {model.cameras.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => { setActive(c.id); setTab("3d"); }} aria-pressed={c.id === active} className={`w-full truncate rounded-lg px-2.5 py-1.5 text-start ${c.id === active ? "bg-[color:var(--vmb-bg-sunk)] font-semibold" : "hover:bg-[color:var(--vmb-bg-sunk)]"}`}>
                  {c.title}
                </button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-[color:var(--vmb-muted)]">{labels.camerasLater}</p>
        </section>
      </aside>
    </div>
  );
}
