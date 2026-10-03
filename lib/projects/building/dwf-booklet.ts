import { buildingFromDwf, type BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import { assembleBookletHtml } from "@/lib/projects/building/dwf-booklet-html";
import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { elevationFrame, type ElevationFrame } from "@/lib/projects/building/elevation-frame";
import type { BuildingModel } from "@/lib/projects/building/model";
import { asCutPlan } from "@/lib/projects/building/cut-model";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import { massMatch } from "@/lib/projects/building/finish";
import { forEachDwfFlat, listDwfUnits, readDwfStrip } from "@/lib/projects/dwf-building";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { floorplanGeometryPayload } from "@/lib/projects/floorplan-geometry-payload";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";
import { frameToContent } from "@/lib/projects/building/flat-finish";
import { dollhouseView, flatToPrimitives } from "@/lib/projects/building/flat-model";
import { stampFloorplanStill } from "@/lib/projects/floorplan-viz-stamp";
import { buildSceneFromPayload } from "@/lib/projects/scene3d/from-payload";
import { sceneStyleFor } from "@/lib/projects/scene3d/style";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import { splitStrip } from "@/lib/projects/sheet-split";

/**
 * A building's booklet from its permit strip (DWF), in stages a job can run
 * one function call at a time.
 *
 * The whole takes eight minutes and a function five, so the work is cut where
 * it can be resumed: the model (the strip read and the building stood up,
 * with every sheet's picture), the views (drawn a few at a time), the
 * apartments (a floor at a time) and the assembly. Each stage leaves its
 * pictures in a store and its place in a plain state, and runs until it is
 * done or its time is up. The script runs every stage in one go against a
 * store in memory; the platform's job, one stage a call, against Blob.
 *
 * Each floor sheet is paired with its storey drawn from above in the sheet's
 * own frame — the same picture, pixel for pixel — and each elevation with
 * the face. Nothing here calls an image model.
 */
export type BookletStage = "model" | "views" | "apartments" | "assemble" | "done";

export type BookletApartment = { key: string; label: string; levelM: number; areaM2: number; bedrooms: number; spaces: number; terraces: number };

export type BookletState = {
  subtitle?: string;
  floors?: BuildingFloorMeta[];
  extent?: BuildingModel["extent"];
  /** Elevations the strip draws, by view id, in the order the booklet shows them. */
  elevations?: string[];
  /** Each elevation's frame on its sheet, which its render is drawn in. */
  elevationFrames?: Record<string, Pick<ElevationFrame, "widthM" | "bottomM" | "topM">>;
  units?: Array<{ unit: number; level: "lower" | "upper" | null; levelM: number }>;
  viewsDone?: string[];
  apartments?: BookletApartment[];
  /** What each stored picture is called, and where the store put it. */
  artefacts?: Record<string, string>;
  /** The window the elevations draw, measured on `measured` of them (0: the standard). */
  window?: { sill: number; head: number; measured: number };
  /** Which material each facade hatch took. */
  facade?: { painted: number; key: Partial<Record<string, string>> };
};

export type ArtefactStore = {
  /** Keep `data`; answers where, for get(). */
  put(name: string, data: Buffer, contentType: string): Promise<string>;
  get(ref: string): Promise<Buffer>;
};

export const ELEVATIONS: Array<[string, string]> = [
  ["elev-south", "חזית דרומית"],
  ["elev-east", "חזית מזרחית"],
  ["elev-north", "חזית צפונית"],
  ["elev-west", "חזית מערבית"],
];

const unitKey = (u: { unit: number; level: "lower" | "upper" | null }) => (u.level ? `${u.unit}-${u.level}` : String(u.unit));

/** A drawing's own extent on its sheet: its lines, the stray 2% at either end left out. */
function drawnBox(g: DwfGeometry): { x: number; y: number; width: number; height: number } {
  const xs = g.segments.flatMap((s) => [s.x1, s.x2]).sort((a, b) => a - b);
  const ys = g.segments.flatMap((s) => [s.y1, s.y2]).sort((a, b) => a - b);
  const at = (arr: number[], q: number) => arr[Math.min(arr.length - 1, Math.max(0, Math.round(q * (arr.length - 1))))] ?? 0;
  const [x0, x1, y0, y1] = [at(xs, 0.02), at(xs, 0.98), at(ys, 0.02), at(ys, 0.98)];
  const pad = 0.04 * Math.max(x1 - x0, y1 - y0);
  return { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
}

export type StageInput = {
  stage: BookletStage;
  state: BookletState;
  projectName: string;
  source: () => Promise<Buffer>;
  store: ArtefactStore;
  /** Epoch ms the call must hand back by; a stage stops at a resumable point before it. */
  deadline: number;
  styleId?: string;
  say?: (step: string) => void;
  /** Path-trace the outside views with this many samples a pixel: local only, the tracer is a dev dependency. */
  traceSamples?: number;
};

/** Where the job stands after a call, and the booklet's page once it is assembled. */
export type StageResult = { stage: BookletStage; state: BookletState; html?: string };

export async function runBookletStage(input: StageInput): Promise<StageResult> {
  const say = input.say ?? (() => undefined);
  const state: BookletState = { ...input.state, artefacts: { ...(input.state.artefacts ?? {}) } };
  const keep = async (name: string, data: Buffer, type = "image/jpeg") => {
    state.artefacts![name] = await input.store.put(name, data, type);
  };
  const strip = async () => {
    const s = readDwfStrip(await input.source());
    if (!s) throw new Error("לא ניתן לקרוא את קובץ ה-DWF");
    return s;
  };

  if (input.stage === "model") {
    say("reading the building");
    const s = await strip();
    const building = buildingFromDwf(s, { name: input.projectName });
    await keep("model.json", Buffer.from(JSON.stringify(building.model)), "application/json");
    for (const f of building.floors) {
      if (!f.roof) await keep(`sheet-${f.id}.jpg`, await dwfSheetJpeg(f.sheet, { x: 0, y: 0, width: f.sheet.pageWidth, height: f.sheet.pageHeight }, 2400));
    }
    const drawn = splitStrip(s);
    state.elevations = [];
    state.elevationFrames = {};
    for (const [id, title] of ELEVATIONS) {
      const sheet = drawn.find((d) => d.kind === "elevation" && (d.title ?? "").includes(title));
      if (!sheet) continue;
      const g = sheetGeometry(s, sheet.box);
      const frame = elevationFrame(g);
      await keep(`sheet-${id}.jpg`, await dwfSheetJpeg(g, frame?.box ?? drawnBox(g), 2400));
      if (frame) state.elevationFrames[id] = { widthM: frame.widthM, bottomM: frame.bottomM, topM: frame.topM };
      state.elevations.push(id);
    }
    state.floors = building.floors.map(({ sheet: _sheet, ...meta }) => meta);
    state.window = building.window;
    state.facade = building.facade;
    state.extent = building.model.extent;
    state.units = listDwfUnits(s).map((u) => ({ unit: u.unit, level: u.level, levelM: u.levelM }));
    state.viewsDone = [];
    state.apartments = [];
    return { stage: "views", state };
  }

  if (input.stage === "views") {
    const views = dwfBuildingViews({ floors: state.floors ?? [], model: { extent: state.extent! } }, undefined, state.elevationFrames ?? {});
    const pending = views.filter((v) => !(state.viewsDone ?? []).includes(v.id));
    const model = JSON.parse((await input.store.get(state.artefacts!["model.json"]!)).toString("utf8")) as BuildingModel;
    // A few at a time: one browser for each batch, and the deadline checked between them.
    for (let i = 0; i < pending.length; i += 3) {
      if (Date.now() > input.deadline) return { stage: "views", state };
      const batch = pending.slice(i, i + 3);
      say(`drawing ${batch.map((v) => v.id).join(", ")}`);
      // A plan is traced too: its cut is made in the geometry (cut-model.ts).
      const traced = (_v: (typeof batch)[number]) => (input.traceSamples ? { pathTrace: { samples: input.traceSamples } } : {});
      const frames = await renderBuildingFrames(batch.map((v) => ({ ...v.payload, model, ...traced(v) })), { outputWidthPx: 2000, timeoutMs: 1_200_000 });
      // A traced frame is checked against the plain one of the same view: its
      // masses must be the same. A tracer that ran out of GPU drew floors
      // without walls, and the finish then painted that faithfully.
      if (input.traceSamples) {
        const plainOf = batch.filter((v) => Object.keys(traced(v)).length > 0);
        // A plan's reference is cut the same way as its traced frame.
        const plain = plainOf.length ? await renderBuildingFrames(plainOf.map((v) => asCutPlan({ ...v.payload, model })), { outputWidthPx: 2000 }) : [];
        for (let k = 0, j = 0; k < batch.length; k++) {
          if (!Object.keys(traced(batch[k]!)).length) continue;
          const reference = plain[j++]!;
          const same = await massMatch(reference, frames[k]!);
          if (same < 0.6) {
            say(`${batch[k]!.id}: traced frame differs from the plain one (${same.toFixed(2)}); the plain one is used`);
            frames[k] = reference;
          }
        }
      }
      for (let k = 0; k < batch.length; k++) {
        await keep(`view-${batch[k]!.id}.jpg`, frames[k]!);
        state.viewsDone = [...(state.viewsDone ?? []), batch[k]!.id];
      }
    }
    return { stage: "apartments", state };
  }

  if (input.stage === "apartments") {
    const done = new Set((state.apartments ?? []).map((a) => a.key));
    const wanted = (state.units ?? []).filter((u) => !done.has(unitKey(u)));
    const style = resolveFloorplanVizStyle(input.styleId ?? "haredi_classic");
    let finished = true;
    await forEachDwfFlat(await strip(), wanted, async (u, flat) => {
      const levelM = (state.units ?? []).find((w) => w.unit === u.unit && w.level === u.level)?.levelM ?? 0;
      const label = `דירה ${u.unit}${u.level === "upper" ? " — קומה עליונה" : u.level === "lower" ? " — קומה תחתונה" : ""}`;
      const entry: BookletApartment = { key: unitKey(u), label, levelM, areaM2: 0, bedrooms: 0, spaces: 0, terraces: 0 };
      if (flat) {
        say(`drawing ${label}`);
        // The flat as the building is drawn: its finishes, its furniture
        // upholstered, its walls cut solid at 1.1 m — traced where the
        // booklet traces.
        const scene = buildSceneFromPayload(
          floorplanGeometryPayload(flat.flat, flat.rooms, { labelled: [], page: { width: flat.sheet.pageWidth, height: flat.sheet.pageHeight } }),
          { rules: sceneStyleFor(style).rules },
        );
        if (scene.meshes.length) {
          const view = dollhouseView(scene);
          const model = flatToPrimitives(scene, { cutAboveM: view.cutAboveM });
          const [frame] = await renderBuildingFrames(
            [{ ...view.payload, model, ...(input.traceSamples ? { pathTrace: { samples: input.traceSamples } } : {}) }],
            { outputWidthPx: 2000, timeoutMs: 600_000 },
          );
          if (frame) {
            const framed = await frameToContent(frame, 1.45);
            const stamped = await stampFloorplanStill({ base64: framed.toString("base64"), mimeType: "image/jpeg" }, { unitLabel: label, areaM2: flat.flat.floorM2 });
            await keep(`unit-${entry.key}.jpg`, Buffer.from(stamped.base64, "base64"));
          }
        }
        entry.areaM2 = Math.round(flat.flat.floorM2 * 10) / 10;
        entry.bedrooms = flat.rooms.filter((r) => r.kind === "bedroom" || r.kind === "mmd").length;
        entry.spaces = flat.rooms.length;
        entry.terraces = flat.flat.terraces.length;
      }
      state.apartments = [...(state.apartments ?? []), entry];
      // Stop between floors once the time is nearly up; the next call goes on.
      if (Date.now() > input.deadline) {
        finished = false;
        return false;
      }
    });
    return { stage: finished ? "assemble" : "apartments", state };
  }

  if (input.stage === "assemble") {
    say("assembling the booklet");
    return { stage: "done", state, html: await assembleBookletHtml(input.projectName, state, input.store) };
  }
  return { stage: "done", state };
}

/** Every stage in one go, against a store in memory: the script's way. */
export async function runWholeBooklet(
  input: Omit<StageInput, "stage" | "state" | "store" | "deadline"> & {
    subtitle?: string;
    /** Once the views are drawn: a chance to replace any of them — the photographic finish. */
    afterViews?: (pictures: { get(name: string): Buffer | undefined; set(name: string, data: Buffer): void }) => Promise<void>;
  },
): Promise<{ html: string; state: BookletState }> {
  const memory = new Map<string, Buffer>();
  const store: ArtefactStore = {
    put: async (name, data) => {
      memory.set(name, data);
      return name;
    },
    get: async (ref) => {
      const hit = memory.get(ref);
      if (!hit) throw new Error(`no artefact ${ref}`);
      return hit;
    },
  };
  let stage: BookletStage = "model";
  let state: BookletState = { subtitle: input.subtitle };
  for (;;) {
    const r = await runBookletStage({ ...input, stage, state, store, deadline: Infinity });
    if (stage === "views" && r.stage !== "views" && input.afterViews) {
      const refs = r.state.artefacts ?? {};
      await input.afterViews({
        get: (name) => (refs[name] ? memory.get(refs[name]!) : undefined),
        set: (name, data) => {
          if (refs[name]) memory.set(refs[name]!, data);
        },
      });
    }
    stage = r.stage;
    state = r.state;
    if (r.html) return { html: r.html, state };
  }
}
