import { buildingFromDwf, type BuildingFinish, type BuildingFloorMeta } from "@/lib/projects/building/from-dwf";
import { facadeTitle, PLAN_NORTH, type Naming, type North, type Side } from "@/lib/projects/building/compass";
import type { HouseAiReport } from "@/lib/projects/building/house-ai";
import type { HouseAuditFinding } from "@/lib/projects/building/house-audit";
import type { HouseSiteLevels, YardHint } from "@/lib/projects/building/house-yard";
import { assembleBookletHtml } from "@/lib/projects/building/dwf-booklet-html";
import { dwfBuildingViews } from "@/lib/projects/building/dwf-views";
import { elevationFrame, type ElevationFrame } from "@/lib/projects/building/elevation-frame";
import type { BuildingModel } from "@/lib/projects/building/model";
import { asCutPlan } from "@/lib/projects/building/cut-model";
import { housePlanPadMetres } from "@/lib/projects/building/plan-geometry-gate";
import {
  assertHousePlanGeometry,
  formatPlanGeometryGate,
} from "@/lib/projects/building/plan-geometry-gate";
import { renderBuildingFrames } from "@/lib/projects/building/renderer";
import { massMatch } from "@/lib/projects/building/finish";
import { vividHouseFrame } from "@/lib/projects/building/house-colour";
import { readRoomLabels, type RoomLabel } from "@/lib/projects/building/room-labels";
import { DWF_FLOOR_UNITS_PER_METRE, forEachDwfFlat, listDwfUnits, readDwfStrip } from "@/lib/projects/dwf-building";
import type { DwfFloor } from "@/lib/projects/dwf-floor";
import { sheetGeometry, type DwfGeometry } from "@/lib/projects/floorplan-dwf";
import type { FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
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
  /** A private house wears plaster, stone frames and its own ground. A permit building does not. */
  finish?: BuildingFinish;
  /** The parking bays its ground floor sheet draws, each with a car. */
  parking?: number;
  /** The pictures painted as photographs over their renders, by name. */
  painted?: string[];
  /** The painting stopped at the user's budget, and how many pictures it left unpainted. */
  budget?: { ils: number; unpainted: number };
  /** What the vision model read off a house's sheets, and what of it the sheets bore out. */
  ai?: HouseAiReport;
  /** Where the vision model sees a sheet and its measured render part: reported, not repaired. */
  audit?: HouseAuditFinding[];
  /** True north in the model's frame (compass.ts): every face's and view's name is turned by it. */
  north?: North;
  /** A house's plot levels, for what the booklet says of its slope. */
  site?: HouseSiteLevels;
  /** The roof and its parapet's top, where the elevations mark them: the building's height is the parapet's. */
  top?: { roof: number; parapet: number };
  /** A house's plot, its boundary's box: its elevations cut the ground there. */
  plot?: { x0: number; z0: number; x1: number; z1: number };
  /** A house's street front, the plan's side its plot meets the street on: the cover looks from there. */
  street?: "north" | "south" | "east" | "west";
  /** How the reader is told the sides (compass.ts): by the compass, or from the street where true north is not known. */
  naming?: Naming;
  /** Each storey's rooms as its sheet labels them (room-labels.ts), by the floor's id: the booklet's measurements. */
  rooms?: Record<string, RoomLabel[]>;
  /** Each storey's doors by width (cm) and its windows, as the CAD file counts them — both homes of a pair. */
  openings?: Array<{ storey: number; doors: Record<string, number>; windows: number }>;
  /** The lawn its ground floor sheet hatches, m². */
  lawnM2?: number;
  /** A house plan's padding round its sheet's frame, metres, by floor id: where a room's label stands in the picture. */
  planPadM?: Record<string, number>;
};

export type ArtefactStore = {
  /** Keep `data`; answers where, for get(). */
  put(name: string, data: Buffer, contentType: string): Promise<string>;
  get(ref: string): Promise<Buffer>;
};

/** The elevation views, by the plan's side each looks at (compass.ts): the view's id stays the plan's, its title the compass's. */
export const ELEVATIONS: Array<[string, Side]> = [
  ["elev-south", "south"],
  ["elev-east", "east"],
  ["elev-north", "north"],
  ["elev-west", "west"],
];

/** An elevation view's title, as the architect names that face. */
export function elevationTitle(id: string, north: North = PLAN_NORTH): string {
  const side = ELEVATIONS.find(([e]) => e === id)?.[1];
  return side ? facadeTitle(side, north) : id;
}

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
  /** The haredi switch for the furniture built (HouseProject.haredi): single beds, a lone kitchen sink double. */
  haredi?: boolean;
  /** False where the drawing has no parking (not a private house): the cars gate then passes with none. Default true. */
  requireCars?: boolean;
  /** Absent: a house when the strip names no apartments, a permit building when it does. */
  finish?: BuildingFinish;
  /** The strip already read. Absent: `source` is read as a DWF. */
  geometry?: () => Promise<DwfGeometry>;
  /** A house's plot levels, from its elevations. */
  site?: HouseSiteLevels;
  /** Parts of a house's plot the vision model named a garden and the sheet bore out. */
  yard?: YardHint[];
  /** True north in the model's frame, where the sheets' is not up. */
  north?: North;
  /** The roof and its parapet's top, where the elevations mark them. */
  top?: { roof: number; parapet: number };
  /** False where true north was not known but taken as the sheet's up: a house's sides are then named from its street. */
  northKnown?: boolean;
  /** What the rooms of a floor whose sheet names none are: a house's, read off its drawn furniture. */
  roomKinds?: (sheet: DwfGeometry, floor: DwfFloor) => Promise<ReadonlyMap<number, FloorplanRoomKind> | null>;
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
    if (input.geometry) return input.geometry();
    const s = readDwfStrip(await input.source());
    if (!s) throw new Error("לא ניתן לקרוא את קובץ ה-DWF");
    return s;
  };

  if (input.stage === "model") {
    say("reading the building");
    const s = await strip();
    const permit = splitStrip(s).some((d) => d.kind === "floor" && d.units.length > 0);
    const finish = input.finish ?? (permit ? "permit" : "house");
    state.finish = finish;
    const building = buildingFromDwf(s, { name: input.projectName, finish, site: input.site, yard: input.yard, north: input.north, top: input.top, haredi: input.haredi });
    state.parking = building.model.primitives.filter((p) => p.tag === "yard:car").length;
    state.north = building.model.north;
    if (input.site) state.site = input.site;
    if (input.top) state.top = input.top;
    if (building.model.street) state.street = building.model.street;
    if (building.model.plot) state.plot = building.model.plot;
    state.naming =
      input.northKnown === false && building.model.street ? { by: "street", street: building.model.street } : { by: "compass", north: building.model.north };
    await keep("model.json", Buffer.from(JSON.stringify(building.model)), "application/json");
    state.rooms = Object.fromEntries(building.floors.filter((f) => !f.roof).map((f) => [f.id, readRoomLabels(f.sheet)]));
    for (const f of building.floors) {
      if (!f.roof) await keep(`sheet-${f.id}.jpg`, await dwfSheetJpeg(f.sheet, { x: 0, y: 0, width: f.sheet.pageWidth, height: f.sheet.pageHeight }, 2400));
      // The storey's outline in its plan's frame — the plan is framed on its
      // sheet — for checking a painting's furniture inside the house only.
      if (!f.roof && f.outline.length >= 3) await keep(`mask-${f.id}.png`, await outlineMask(f.outline, f.shift, f.sheet.pageWidth, f.sheet.pageHeight));
    }
    const drawn = splitStrip(s);
    state.elevations = [];
    state.elevationFrames = {};
    for (const [id] of ELEVATIONS) {
      const title = elevationTitle(id, state.north);
      const sheet = drawn.find((d) => d.kind === "elevation" && (d.title ?? "").includes(title));
      if (!sheet) continue;
      const g = sheetGeometry(s, sheet.box);
      const frame = elevationFrame(g, undefined, { house: finish === "house" });
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
    const model = JSON.parse((await input.store.get(state.artefacts!["model.json"]!)).toString("utf8")) as BuildingModel;
    const views = dwfBuildingViews({ floors: state.floors ?? [], model: { extent: state.extent!, primitives: model.primitives } }, undefined, state.elevationFrames ?? {}, { house: state.finish === "house", north: state.north, street: state.street, plot: state.plot });
    if (state.finish === "house") {
      state.planPadM = Object.fromEntries(
        (state.floors ?? []).filter((f) => !f.roof).map((f) => [f.id, housePlanPadMetres({ id: f.id, sheetWidth: f.sheetWidth, sheetHeight: f.sheetHeight, shift: f.shift }, model.primitives)]),
      );
    }
    const pending = views.filter((v) => !(state.viewsDone ?? []).includes(v.id));
    // A few at a time: one browser for each batch, and the deadline checked between them.
    for (let i = 0; i < pending.length; i += 3) {
      if (Date.now() > input.deadline) return { stage: "views", state };
      const batch = pending.slice(i, i + 3);
      say(`drawing ${batch.map((v) => v.id).join(", ")}`);
      // A plan is traced too: its cut is made in the geometry (cut-model.ts).
      const traced = (_v: (typeof batch)[number]) => (input.traceSamples ? { pathTrace: { samples: input.traceSamples } } : {});
      // A house's plan is cut in the geometry, so its walls show their section solid.
      const payloadOf = (v: (typeof batch)[number]) => {
        const p = { ...v.payload, model, ...traced(v) };
        return state.finish === "house" && p.camera.cutAboveM != null ? asCutPlan(p) : p;
      };
      // House plans are authored ≥4000px — keep that for the measured booklet.
      const outW = state.finish === "house" ? 4000 : 2000;
      const frames = await renderBuildingFrames(batch.map(payloadOf), { outputWidthPx: outW, timeoutMs: 1_200_000 });
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
        const v = batch[k]!;
        await keep(`view-${v.id}.jpg`, state.finish === "house" ? await vividHouseFrame(frames[k]!, v.payload.camera.interior === true ? "interior" : v.payload.camera.cutAboveM != null ? "plan" : "outside") : frames[k]!);
        state.viewsDone = [...(state.viewsDone ?? []), batch[k]!.id];
      }
    }
    // Gate 0 — measured geometry must pass before assemble / any future paint.
    if (state.finish === "house" && (state.floors?.length ?? 0) > 0) {
      const gate = assertHousePlanGeometry({
        floors: (state.floors ?? []).filter((f) => !f.roof).map((f) => ({
          id: f.id,
          sheetWidth: f.sheetWidth,
          sheetHeight: f.sheetHeight,
          shift: f.shift,
        })),
        primitives: model.primitives,
        requireCars: input.requireCars,
      });
      await keep("geometry-gate.json", Buffer.from(JSON.stringify(gate, null, 2)), "application/json");
      say(formatPlanGeometryGate(gate).split("\n")[0]!);
      if (!gate.ok) {
        say(formatPlanGeometryGate(gate));
        throw new Error(`plan geometry gate blocked: ${gate.faults.join(", ")}`);
      }
    }
    return { stage: "apartments", state };
  }

  if (input.stage === "apartments") {
    // A private house is drawn whole and shown whole, as its sheets draw it:
    // no page cuts the pair of houses into its homes.
    if (state.finish === "house") return { stage: "assemble", state: { ...state, apartments: [] } };
    const done = new Set((state.apartments ?? []).map((a) => a.key));
    const wanted = (state.units ?? []).filter((u) => !done.has(unitKey(u)));
    const style = resolveFloorplanVizStyle(input.styleId ?? "haredi_classic");
    let finished = true;
    await forEachDwfFlat(await strip(), wanted, async (u, flat) => {
      const levelM = (state.units ?? []).find((w) => w.unit === u.unit && w.level === u.level)?.levelM ?? 0;
      const place = u.level === "upper" ? " — קומה עליונה" : u.level === "lower" ? " — קומה תחתונה" : "";
      const label = `${state.finish === "house" ? "בית" : "דירה"} ${u.unit}${place}`;
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
    }, { roomKinds: input.roomKinds });
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
    /**
     * Once every view and apartment is drawn, before the booklet is put
     * together: the same chance, over all of them. Answers the pictures it
     * painted, or those and what an audit of them found.
     */
    beforeAssemble?: (pictures: {
      names(): string[];
      get(name: string): Buffer | undefined;
      set(name: string, data: Buffer): void;
    }) => Promise<string[] | { painted?: string[]; audit?: HouseAuditFinding[]; budget?: BookletState["budget"] } | void>;
    /** What the vision model read off the sheets before the building was stood up. */
    ai?: HouseAiReport;
  },
): Promise<{ html: string; state: BookletState; artefacts: Map<string, Buffer> }> {
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
  let state: BookletState = { subtitle: input.subtitle, ...(input.ai ? { ai: input.ai } : {}) };
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
    if (r.stage === "assemble" && stage !== "assemble" && input.beforeAssemble) {
      const refs = r.state.artefacts ?? {};
      const done = await input.beforeAssemble({
        names: () => Object.keys(refs),
        get: (name) => (refs[name] ? memory.get(refs[name]!) : undefined),
        set: (name, data) => {
          if (refs[name]) memory.set(refs[name]!, data);
        },
      });
      const painted = Array.isArray(done) ? done : done?.painted;
      if (painted) r.state.painted = painted;
      if (done && !Array.isArray(done) && done.audit) r.state.audit = done.audit;
      if (done && !Array.isArray(done) && done.budget) r.state.budget = done.budget;
    }
    stage = r.stage;
    state = r.state;
    if (r.html) return { html: r.html, state, artefacts: memory };
  }
}

/** White inside a storey's outline, black outside, in its sheet's frame, 800 px wide. */
async function outlineMask(outline: Array<[number, number]>, shift: { x: number; y: number }, pageWidth: number, pageHeight: number): Promise<Buffer> {
  const W = 800;
  const H = Math.max(1, Math.round((W * pageHeight) / pageWidth));
  const k = W / (pageWidth / DWF_FLOOR_UNITS_PER_METRE);
  const pts = outline.map(([x, z]) => `${((x - shift.x) * k).toFixed(1)},${((z - shift.y) * k).toFixed(1)}`).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="black"/><polygon points="${pts}" fill="white"/></svg>`;
  const sharp = (await import("sharp")).default;
  return sharp(Buffer.from(svg)).png().toBuffer();
}
