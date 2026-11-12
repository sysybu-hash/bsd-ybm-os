"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Plus, Trash2 } from "lucide-react";
import type { StudioCamera, StudioData } from "@/lib/projects/pipeline/flat-studio";
import type { VmbStudioCamera } from "@/lib/validation/schemas/vmb-studio";
import { ModelViewer, type Pose, type ViewerLabels } from "@/components/vmb/studio3d/ModelViewer";
import { PlanLocator } from "@/components/vmb/studio3d/PlanLocator";
import { SheetOverlay, type OverlayLabels } from "@/components/vmb/studio3d/SheetOverlay";
import { BuildingWorkbench, type BuildingBenchLabels } from "@/components/vmb/studio3d/BuildingWorkbench";
import type { BuildingStudioData } from "@/lib/projects/pipeline/building-studio";

export type WorkbenchLabels = {
  tab3d: string;
  tabSheet: string;
  loading: string;
  failed: string;
  camerasTitle: string;
  locator: string;
  add: string;
  /** {n} */
  newName: string;
  remove: string;
  pending: string;
  yours: string;
  max: string;
  saveFailed: string;
  nextRun: string;
  noSheet: string;
  viewer: ViewerLabels;
  overlay: OverlayLabels;
  building: BuildingBenchLabels;
};

const isBuilding = (d: StudioData | BuildingStudioData): d is BuildingStudioData => "kind" in d && d.kind === "building";

const MAX = 8;
const newId = () => `c${Math.random().toString(36).slice(2, 10)}`;

/**
 * The studio of one delivered flat (plan M3): the model in 3D at each camera the booklet used, a plan that shows
 * where they stand, the model over the client's sheet with its measured distances, and cameras the client adds for
 * the next run.
 */
export function StudioWorkbench({ projectId, saved, labels, source }: { projectId: string; saved: VmbStudioCamera[]; labels: WorkbenchLabels; /** Where the model and sheet are read from (a storey's sheet: "{key}" in it); the project API when left out. */ source?: { data: string; sheet: string } }) {
  const dataSrc = source?.data ?? `/api/vmb/projects/${projectId}/studio?part=data`;
  const sheetSrc = source?.sheet ?? `/api/vmb/projects/${projectId}/studio?part=sheet`;
  const [data, setData] = useState<StudioData | null>(null);
  const [building, setBuilding] = useState<BuildingStudioData | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<"3d" | "sheet">("3d");
  const [mine, setMine] = useState<VmbStudioCamera[]>(saved);
  const [active, setActive] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const poseRef = useRef<(() => Pose) | null>(null);

  useEffect(() => {
    let off = false;
    fetch(dataSrc)
      .then((r) => (r.ok ? (r.json() as Promise<StudioData | BuildingStudioData>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (off) return;
        if (isBuilding(d)) return setBuilding(d);
        setData(d);
        setActive(d.cameras[0]?.id ?? null);
      })
      .catch(() => !off && setError(true));
    return () => {
      off = true;
    };
  }, [dataSrc]);

  const cameras = useMemo<Array<StudioCamera & { pending?: boolean }>>(() => {
    if (!data) return [];
    const rendered = new Set(data.cameras.map((c) => c.id));
    const engine = data.cameras.filter((c) => !c.client);
    return [...engine, ...mine.map((c) => ({ ...c, client: true, pending: !rendered.has(c.id) }))];
  }, [data, mine]);
  const camera = cameras.find((c) => c.id === active) ?? null;

  const save = async (next: VmbStudioCamera[]) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/vmb/projects/${projectId}/cameras`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ cameras: next }) });
      if (!res.ok) throw new Error(String(res.status));
      setMine(next);
      return true;
    } catch {
      setNote(labels.saveFailed);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const add = async () => {
    const pose = poseRef.current?.();
    if (!pose) return;
    if (mine.length >= MAX) return setNote(labels.max);
    const r2 = (n: number) => Math.round(n * 100) / 100;
    const v = (p: Pose["position"]) => ({ x: r2(p.x), y: r2(p.y), z: r2(p.z) });
    const cam: VmbStudioCamera = { id: newId(), title: labels.newName.replace("{n}", String(mine.length + 1)), position: v(pose.position), target: v(pose.target), fovDeg: Math.round(Math.min(100, Math.max(20, pose.fovDeg))) };
    if (await save([...mine, cam])) {
      setActive(cam.id);
      setNote(labels.nextRun);
    }
  };
  const remove = (id: string) => void save(mine.filter((c) => c.id !== id)).then((ok) => ok && active === id && setActive(data?.cameras[0]?.id ?? null));

  if (error) return <p className="vmb-card p-5 text-sm text-[color:var(--vmb-ink-soft)]">{labels.failed}</p>;
  if (building) return <BuildingWorkbench data={building} sheetSrc={(key) => source?.sheet.replace("{key}", key) ?? `/api/vmb/projects/${projectId}/studio?part=sheet&key=${encodeURIComponent(key)}`} labels={labels.building} />;
  if (!data) return <div className="vmb-card h-[560px] animate-pulse" aria-label={labels.loading} />;

  const tabBtn = (id: "3d" | "sheet", label: string) => (
    <button type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`rounded-full px-4 py-1.5 font-semibold ${tab === id ? "bg-[color:var(--vmb-bg-raised)] shadow" : "text-[color:var(--vmb-muted)]"}`}>
      {label}
    </button>
  );
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="vmb-card min-w-0 space-y-4 p-4">
        <div className="flex rounded-full bg-[color:var(--vmb-bg-sunk)] p-1 text-sm w-fit" role="tablist">
          {tabBtn("3d", labels.tab3d)}
          {tabBtn("sheet", labels.tabSheet)}
        </div>
        {tab === "3d" ? (
          <ModelViewer scene={data.scene} camera={camera} poseRef={poseRef} labels={labels.viewer} />
        ) : data.sheet ? (
          <SheetOverlay src={sheetSrc} sheet={data.sheet} overlay={data.overlay} labels={labels.overlay} />
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
          <PlanLocator scene={data.scene} cameras={cameras} active={active} onPick={(id) => { setActive(id); setTab("3d"); }} label={labels.locator} />
          <ul className="space-y-1 text-sm">
            {cameras.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <button type="button" onClick={() => { setActive(c.id); setTab("3d"); }} aria-pressed={c.id === active} className={`min-w-0 flex-1 truncate rounded-lg px-2.5 py-1.5 text-start ${c.id === active ? "bg-[color:var(--vmb-bg-sunk)] font-semibold" : "hover:bg-[color:var(--vmb-bg-sunk)]"}`}>
                  {c.title}
                  {c.client ? <span className="ms-2 text-[11px] text-[color:var(--vmb-measure)]">{c.pending ? labels.pending : labels.yours}</span> : null}
                </button>
                {c.client ? (
                  <button type="button" disabled={busy} onClick={() => remove(c.id)} className="rounded-full p-1.5 text-[color:var(--vmb-muted)] hover:text-[color:var(--vmb-fail)]" aria-label={`${labels.remove} ${c.title}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy || tab !== "3d"} onClick={() => void add()} className="flex w-full items-center justify-center gap-1.5 rounded-full border border-[color:var(--vmb-line-strong)] px-4 py-2 text-xs font-semibold hover:border-[color:var(--vmb-accent)] disabled:opacity-50">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {labels.add}
          </button>
          {note ? <p className="text-xs text-[color:var(--vmb-ink-soft)]" role="status">{note}</p> : null}
        </section>
      </aside>
    </div>
  );
}
