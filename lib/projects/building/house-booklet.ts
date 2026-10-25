import { facadeTitle, PLAN_NORTH, sideOfTitle, type North } from "@/lib/projects/building/compass";
import { elevationTitle, runWholeBooklet, type BookletState, type StageInput } from "@/lib/projects/building/dwf-booklet";
import { assembleProjectBookletHtml } from "@/lib/projects/building/dwf-booklet-html";
import { elevationFrame, type ElevationFrame } from "@/lib/projects/building/elevation-frame";
import { buildingFromDwf } from "@/lib/projects/building/from-dwf";
import type { HouseAiReport } from "@/lib/projects/building/house-ai";
import { HOUSE_EXTERIOR } from "@/lib/projects/building/house-finish";
import { auditPair, YARD_ELEMENTS, type AuditPair, type HouseAuditFinding } from "@/lib/projects/building/house-audit";
import type { HouseSpend } from "@/lib/projects/building/house-cost";
import { faceFacts, planFacts, proposeFaces, verifyFaces, type FaceFacts, type FaceProposal } from "@/lib/projects/building/house-faces";
import { knownLevels, readElevationLevels, siteLevelsFrom, withLevelMarks, type ElevationLevels, type LevelReading, type Side } from "@/lib/projects/building/house-levels";
import { paintHousePictures, paintingPlan } from "@/lib/projects/building/house-photoreal";
import {
  assertPlanPipelineReady,
  assertProductionPlanPaintEnv,
  housePaintPlansOnly,
  type PlanGeometryGateResult,
} from "@/lib/projects/building/plan-geometry-gate";
import type { PlanVisualGateResult } from "@/lib/projects/building/plan-visual-gate";
import { assertElevationsAllowed, readPlansReady, type PlansReadyFile } from "@/lib/projects/building/plans-ready";
import type { AnswerMemo, PaintingCache } from "@/lib/projects/building/house-store";
import { readHouseRoomUses } from "@/lib/projects/building/house-rooms-ai";
import { splitDrawings, stackHouseGeometries } from "@/lib/projects/building/house-strip";
import { yardRegions, type HouseSiteLevels, type YardHint } from "@/lib/projects/building/house-yard";
import { classifyYard } from "@/lib/projects/building/house-yard-ai";
import {
  FLAT_SITE,
  GOTTLIEB_HOUSE,
  HOUSE_STYLE,
  houseSheetReader,
  levelsFromMarks,
  readNorthArrow,
  standardLevels,
  USUAL_FACES,
  type HouseLevels,
  type HouseProject,
} from "@/lib/projects/building/house-project";
import { compareToTruth, countsFromBuilding, describeFinding, readTruthByAi, truthFromInventory, type ModelCounts, type TruthFinding } from "@/lib/projects/building/house-truth";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfFloor } from "@/lib/projects/dwf-floor";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";
import { resolveFloorplanVizStyle } from "@/lib/projects/floorplan-viz-styles";
import { houseKnob } from "@/lib/projects/building/house-knobs";

/** The Gottlieb house (house-project.ts), by the names the scripts run it by. */
export const PRIVATE_HOUSE_MODELS = GOTTLIEB_HOUSE.models.map((m) => ({ id: m.id, name: m.name, floors: m.floors.map((f) => f.file) }));
export const PRIVATE_HOUSE_FACADES = GOTTLIEB_HOUSE.facades.file;
export const PRIVATE_HOUSE_STYLE = HOUSE_STYLE;
export const PRIVATE_HOUSE_NORTH: North = GOTTLIEB_HOUSE.north!;
export const PRIVATE_HOUSE_FACADE_TITLES = GOTTLIEB_HOUSE.faces!.map((f) => facadeTitle(f, PRIVATE_HOUSE_NORTH));

export const PRIVATE_HOUSE_SITE: HouseSiteLevels = GOTTLIEB_HOUSE.site!;
export const PRIVATE_HOUSE_LEVELS = GOTTLIEB_HOUSE.levels!;
const SITE_KEYS = ["west", "east", "parkingWest", "parkingEast"] as const;

/** The booklet's subtitle: the style the whole project is in, and its finish. */
export function houseSubtitle(style: ReturnType<typeof resolveFloorplanVizStyle>): string {
  return `${style.labelHe} · ${HOUSE_EXTERIOR.summaryHe}`;
}

/** The project's own name, from a model's booklet name ("גוטליב — דגם A"). */
export function houseProjectName(model: { name: string; projectName: string }): string {
  const tail = ` — ${model.name}`;
  return model.projectName.endsWith(tail) ? model.projectName.slice(0, -tail.length) : model.projectName;
}

/** Every model's booklet as one: a cover, a chapter a model, the review at the end. */
async function projectBooklet(
  projectName: string,
  subtitle: string,
  models: Array<{ name: string; state: BookletState; artefacts: Map<string, Buffer> }>,
): Promise<string> {
  return assembleProjectBookletHtml({
    projectName,
    subtitle,
    models: models.map((m) => ({
      name: m.name,
      state: m.state,
      store: {
        put: async (name) => name,
        get: async (ref) => {
          const hit = m.artefacts.get(ref);
          if (!hit) throw new Error(`no artefact ${ref}`);
          return hit;
        },
      },
    })),
  });
}

/** The sheet/render pairs of a booklet's pictures, for the audit. */
function auditPairs(names: string[], north: North): AuditPair[] {
  const have = new Set(names);
  return names.flatMap((name) => {
    const id = /^sheet-(.+)\.jpg$/.exec(name)?.[1];
    if (!id) return [];
    const elevation = id.startsWith("elev-");
    const render = elevation ? `view-${id}.jpg` : `view-plan-${id}.jpg`;
    if (!have.has(render)) return [];
    const title = elevation ? elevationTitle(id, north) : id.replace(/^floor-(\d+)$/, (_, n: string) => `קומה ${Number(n) + 1}`);
    return [{ sheet: id, title, kind: elevation ? ("elevation" as const) : ("plan" as const), drawing: name, render }];
  });
}

/** The facade sheet as read once for every model: its drawings, their verified marks, and the model's faces for them. */
export type HouseFacades = {
  ai: boolean;
  /** True north on the plans, every face's title is turned by. */
  north: North;
  /** The faces tried where the vision model's are not verified: the hand's, else the usual order. */
  hand: Side[];
  /** The storeys' levels, the hand's, else as the marks give them for so many storeys (null: neither). */
  levels: (storeys: number) => HouseLevels | null;
  /** Each drawing with its verified marks written on it. */
  marked: DwfGeometry[];
  read: Array<{ levels: ElevationLevels; reading: LevelReading[] } | null>;
  frames: Array<ElevationFrame | null>;
  facts: FaceFacts[];
  proposal: Awaited<ReturnType<typeof proposeFaces>>;
};

/** One model ready to stand up: its strip with titled, marked facades, its plot's levels and garden, and the report. */
export type HouseModelReading = {
  strip: DwfGeometry;
  site: HouseSiteLevels;
  yard: YardHint[];
  ai?: HouseAiReport;
  parking: number;
  built: Record<string, number>;
  /** What the plan stood up holds, storey by storey from the ground (house-truth.ts); null where it was not stood up. */
  counts: ModelCounts[] | null;
};

/**
 * The facades' level marks and faces, read once for the sheet all the models
 * share. The faces are proposed against `groundPlan` (the first model's
 * ground floor) and verified against each model's own in readHouseModel.
 */
export async function readHouseFacades(input: {
  /** The facade sheet, or its drawings each with its title (a DXF's: house-project.ts). */
  facades: DwfGeometry | Array<{ title: string; geometry: DwfGeometry }>;
  groundPlan: DwfGeometry;
  ai: boolean;
  say: (step: string) => void;
  /** What the hand knows of the house; the Gottlieb house where none is given. */
  project?: HouseProject;
  /** True north where the project sets none: read off the plan's arrow, else the sheet's up. */
  north?: North;
  /** The level marks' readings already had: the same sheet is read as before. */
  answers?: AnswerMemo;
}): Promise<HouseFacades> {
  const { say } = input;
  const project = input.project ?? GOTTLIEB_HOUSE;
  const north = project.north ?? input.north ?? PLAN_NORTH;
  // Titled drawings name their faces themselves: every one, each a different side.
  const titled = Array.isArray(input.facades) ? input.facades : null;
  const sides = titled?.map((d) => sideOfTitle(d.title, north)) ?? [];
  const byTitle = sides.length > 0 && sides.every((s) => s != null) && new Set(sides).size === sides.length;
  const all = titled ? titled.map((d) => d.geometry) : splitDrawings(input.facades as DwfGeometry);
  const drawings = byTitle ? all : all.slice(0, (project.faces ?? USUAL_FACES).length);
  const hand = byTitle ? (sides as Side[]) : (project.faces ?? USUAL_FACES).slice(0, drawings.length);
  const known = project.levels ? [...project.levels.floors, project.levels.roof, project.levels.parapet] : null;
  const read = input.ai ? await Promise.all(drawings.map((g) => readElevationLevels(g, undefined, input.answers).catch(() => null))) : drawings.map(() => null);
  read.forEach((r, i) => {
    if (!input.ai) return;
    if (!r) return say(`ai levels, facade ${i + 1}: no answer, read as before`);
    const kept = r.levels.marks.map((m) => m.text).join(" ");
    say(`ai levels, facade ${i + 1}: ${r.levels.marks.length} of ${r.reading.length} marks on the sheet's triangles${r.levels.ok ? ` (1:${((100 * DWF_FLOOR_UNITS_PER_METRE) / r.levels.scale).toFixed(1)}): ${kept}` : ` — not used: ${r.levels.why}`}`);
  });
  // Where no verified reading is had, the sections' own levels on the sheet's triangles.
  const marked = drawings.map((g, i) => withLevelMarks(g, read[i]?.levels.ok ? read[i]!.levels : known ? knownLevels(g, known) : null));
  const frames = marked.map((g) => elevationFrame(g, undefined, { house: true }));
  const facts = marked.map((g, i) => faceFacts(g, frames[i] ?? null, read[i]?.levels ?? null));
  let proposal: HouseFacades["proposal"] = null;
  if (input.ai) {
    const g = input.groundPlan;
    const plan = await dwfSheetJpeg(g, { x: 0, y: 0, width: g.pageWidth, height: g.pageHeight }, 2400);
    const images = await Promise.all(read.map((r, i) => (r ? r.image : dwfSheetJpeg(marked[i]!, { x: 0, y: 0, width: marked[i]!.pageWidth, height: marked[i]!.pageHeight }, 3000))));
    proposal = await proposeFaces(images, plan).catch(() => null);
    say(proposal ? `ai faces proposed: ${proposal.proposal.map((p) => p?.face ?? "?").join(", ")}${proposal.missing.length ? `; not drawn: ${proposal.missing.join(", ")}` : ""}` : "ai faces: no answer");
  }
  const kept = read.map((r) => (r ? { levels: r.levels, reading: r.reading } : null));
  return { ai: input.ai, north, hand, levels: facadeLevels(project, kept), marked, read: kept, frames, facts, proposal };
}

/** The storeys' levels: the hand's, else as the facades' marks give them for so many storeys. */
function facadeLevels(project: HouseProject, read: HouseFacades["read"]): HouseFacades["levels"] {
  return (storeys) => project.levels ?? levelsFromMarks(read.map((r) => r?.levels ?? null), storeys);
}

/** The facades as read, kept between a job's steps: everything but the levels, which are worked out again. */
export type StoredHouseFacades = Omit<HouseFacades, "levels">;

export function storeHouseFacades(facades: HouseFacades): StoredHouseFacades {
  const { levels: _levels, ...rest } = facades;
  return rest;
}

export function houseFacadesBack(stored: StoredHouseFacades, project: HouseProject): HouseFacades {
  return { ...stored, levels: facadeLevels(project, stored.read) };
}

/** True north: the project's own, else the plan's arrow; a guess — the sheet's up — names the sides from the street instead. */
export async function houseNorth(input: { project: HouseProject; groundPlan: DwfGeometry; ai: boolean; say: (step: string) => void }): Promise<{ north: North; northKnown: boolean }> {
  if (input.project.north) return { north: input.project.north, northKnown: true };
  const arrow = input.ai ? await readNorthArrow(input.groundPlan).catch(() => null) : null;
  input.say(arrow ? `north: the plan's arrow points ${arrow.degrees}° from the sheet's up` : "north: no arrow read — the sheet's up is taken for north");
  return { north: arrow?.north ?? PLAN_NORTH, northKnown: arrow != null };
}

/** One model's sheets read: its storeys' levels, its floors, its reading against the facades, and its counts against the sheets' truth. */
export async function readHouseModelSheets(input: {
  model: HouseProject["models"][number];
  project: HouseProject;
  sheets: ReturnType<typeof houseSheetReader>;
  facades: HouseFacades;
  ai: boolean;
  say: (step: string) => void;
}): Promise<{ levels: HouseLevels; reading: HouseModelReading; truth: Array<TruthFinding & { text: string }>; openings: NonNullable<BookletState["openings"]>; lawnM2: number | null }> {
  const { model, project, sheets, facades, say } = input;
  const marked = facades.levels(model.floors.length);
  const levels = marked ?? standardLevels(model.floors.length);
  if (!project.levels) say(`${model.name} levels: ${marked ? "from the elevations' marks" : `standard ${STANDARD_STOREY_LABEL}`} — floors ${levels.floors.map((l) => l.toFixed(2)).join(", ")}, roof ${levels.roof.toFixed(2)}, parapet ${levels.parapet.toFixed(2)}`);
  const floors = [];
  for (let i = 0; i < model.floors.length; i++) floors.push({ geometry: await sheets.geometry(model.floors[i]!), levelM: levels.floors[i] ?? i * 3 });
  const fromCad = model.floors.some((f) => /\.dxf$/i.test(f.file));
  const reading = await readHouseModel({ name: model.name, floors, facades, say, site: project.site, count: fromCad });
  const { findings: truth, openings, lawnM2 } = await checkModelTruth({ model, floors, reading, sheets, ai: input.ai, say });
  return { levels, reading, truth, openings, lawnM2 };
}

/** What a model's booklet stages are run with: its strip, plot, north and top, and the vision model's naming of its rooms. */
export function houseStageInput(input: {
  model: HouseProject["models"][number];
  project: HouseProject;
  projectName: string;
  reading: HouseModelReading;
  levels: HouseLevels;
  north: North;
  northKnown: boolean;
  ai: boolean;
  requireCars?: boolean;
  traceSamples?: number;
  say: (step: string) => void;
}): Omit<StageInput, "stage" | "state" | "store" | "deadline"> {
  const { model, project, reading, levels, say } = input;
  const style = resolveFloorplanVizStyle(project.style);
  return {
    projectName: input.projectName,
    source: async () => Buffer.alloc(0),
    geometry: async () => reading.strip,
    styleId: project.style,
    haredi: project.haredi ?? style.audience === "haredi",
    requireCars: input.requireCars,
    finish: "house",
    site: reading.site,
    yard: reading.yard,
    north: input.north,
    northKnown: input.northKnown,
    top: { roof: levels.roof, parapet: levels.parapet },
    ...(input.ai
      ? {
          roomKinds: async (sheet: DwfGeometry, floor: DwfFloor) => {
            const r = await readHouseRoomUses(sheet, floor);
            say(
              r
                ? `${model.name} rooms: ${r.read.map((n) => `#${n.id} ${n.use}${n.kept ? "" : ` — not used: ${n.why}`}`).join("; ")}`
                : `${model.name} rooms: no answer, named by size`,
            );
            return r?.kinds ?? null;
          },
        }
      : {}),
    say,
    traceSamples: input.traceSamples,
  };
}

/** The measured renders against their sheets, before any is painted over: reported, not acted on. */
export async function auditHouseModel(
  pics: { names(): string[]; get(name: string): Buffer | undefined },
  input: { name: string; reading: Pick<HouseModelReading, "parking" | "built">; north: North; say: (step: string) => void },
): Promise<HouseAuditFinding[]> {
  const pairs = auditPairs(pics.names(), input.north);
  const found = await Promise.all(
    pairs.map((p) => {
      const [drawing, render] = [pics.get(p.drawing), pics.get(p.render)];
      // An upper floor's plan is rendered without the plot (dwf-views hides the yard over the ground floor).
      const hidden = p.kind === "plan" && p.sheet !== "floor-0" ? YARD_ELEMENTS : undefined;
      return drawing && render ? auditPair(p, drawing, render, { parking: input.reading.parking, built: input.reading.built, hidden }).catch(() => null) : Promise.resolve(null);
    }),
  );
  pairs.forEach((p, i) =>
    input.say(`${input.name} audit ${p.title}: ${found[i] == null ? "no answer" : found[i]!.length ? found[i]!.map((f) => `${f.element} ${f.issue} (${f.where})${f.contradicted ? ` [${f.contradicted}]` : ""}`).join("; ") : "matches"}`),
  );
  return found.flatMap((f) => f ?? []);
}

/**
 * One model's reading: its faces verified against its plan, its plot's
 * levels from the verified marks, its plot's unnamed parts named — each
 * falling back to the hand-set value where the sheets do not bear it out.
 */
export async function readHouseModel(input: {
  name: string;
  floors: Array<{ geometry: DwfGeometry; levelM: number }>;
  facades: HouseFacades;
  say: (step: string) => void;
  /** The plot's levels the hand set; the land flat round the house where none is set. */
  site?: HouseSiteLevels;
  /** Stand the plan up to count it against the truth even without the vision model. */
  count?: boolean;
}): Promise<HouseModelReading> {
  const { name, floors, facades, say } = input;
  const { read, frames, facts, proposal, north } = facades;

  // The plan alone, stood up once: its width, depth and street side, its plot's unnamed parts, and what it holds.
  const plain = facades.ai || input.count ? buildingFromDwf(stackHouseGeometries(floors), { name, finish: "house", north }) : null;
  const storeys = plain?.floors.filter((f) => !f.roof) ?? [];
  const plan = plain ? planFacts(storeys.map((f) => f.outline), plain.model.primitives) : null;
  const hand: FaceProposal[] = facades.hand.map((face) => ({ face }));
  const aiVerdict = proposal && plan ? verifyFaces(proposal.proposal, facts, plan) : null;
  const handVerdict = plan ? verifyFaces(hand, facts, plan) : null;
  const byAi = aiVerdict?.ok === true;
  const faces: Side[] = byAi ? proposal!.proposal.map((p) => p!.face) : facades.hand;
  const titles = faces.map((f) => facadeTitle(f, north));
  const verdict = byAi ? aiVerdict! : handVerdict;
  if (aiVerdict) say(`${name} faces: ${byAi ? "the model's, verified" : "hand titles"} — ${titles.join(", ")}; ${aiVerdict.checks.length} checks passed${aiVerdict.failures.length ? `, failed: ${aiVerdict.failures.join("; ")}` : ""}`);
  if (!byAi && handVerdict) say(`${name} hand titles against the sheets: ${handVerdict.ok ? "verified" : "not verified"} (${handVerdict.checks.length} passed${handVerdict.failures.length ? `, failed: ${handVerdict.failures.join("; ")}` : ""})`);

  // The plot's levels from the verified marks, where the faces they are turned by are verified too.
  const fromMarks = verdict?.ok
    ? siteLevelsFrom(
        faces.flatMap((face, i) => {
          const [levels, frame] = [read[i]?.levels, frames[i]];
          return levels?.ok && frame ? [{ face, g: facades.marked[i]!, levels, left: frame.left, right: frame.right, centreX: frame.centreX }] : [];
        }),
      )
    : { levels: {}, marks: {}, dropped: [] };
  const site: HouseSiteLevels = { ...(input.site ?? FLAT_SITE), ...fromMarks.levels };
  const siteFrom = Object.fromEntries(SITE_KEYS.map((k) => [k, fromMarks.levels[k] != null ? "ai" : "hand"])) as HouseAiReport["site"]["from"];
  if (facades.ai) say(`${name} site levels: ${SITE_KEYS.map((k) => `${k} ${site[k]?.toFixed(2)} (${siteFrom[k]}${fromMarks.marks[k] ? `: ${fromMarks.marks[k]!.join(" ")}` : ""})`).join(", ")}${fromMarks.dropped.length ? `; not on the land, dropped: ${fromMarks.dropped.join(", ")}` : ""}`);

  // The plot's unnamed parts, named and checked against the ink.
  let yard: { hints: YardHint[]; report: HouseAiReport["yard"] } = { hints: [], report: null };
  if (plain && storeys.length) {
    const lowest = plain.floors[0]!;
    const regions = yardRegions({ sheet: lowest.sheet, shift: lowest.shift, outlines: storeys.map((f) => f.outline) });
    const named = regions.length ? await classifyYard(lowest.sheet, regions).catch(() => null) : null;
    if (named) {
      const counts: Record<string, number> = {};
      for (const v of named.verdicts) counts[v.kind] = (counts[v.kind] ?? 0) + 1;
      yard = { hints: named.hints, report: { shown: named.verdicts.length, laid: named.hints.length, named: counts } };
      say(`${name} yard: ${named.verdicts.map((v) => `#${v.id} ${v.kind} ${v.areaM2} m² — ${v.laid ? "laid" : "kept"} (${v.why})`).join("; ")}`);
    } else say(`${name} yard: ${regions.length} unnamed parts, no model answer — left paved`);
  }

  const ai: HouseAiReport | undefined = facades.ai
    ? {
        levels: read.map((r, i) => ({ title: titles[i]!, read: r?.reading.length ?? 0, kept: r?.levels.ok ? r.levels.marks.length : 0, ok: r?.levels.ok ?? false, why: r ? r.levels.why : "no answer", datum: r?.levels.datum ?? null })),
        faces: {
          source: byAi ? "ai" : "hand",
          verified: verdict?.ok ?? false,
          titles,
          missing: (["south", "west", "north", "east"] as Side[]).filter((s) => !faces.includes(s)).map((s) => facadeTitle(s, north)),
          missingSides: (["south", "west", "north", "east"] as Side[]).filter((s) => !faces.includes(s)),
          checks: verdict?.checks.length ?? 0,
          failures: aiVerdict && !byAi ? aiVerdict.failures : [],
        },
        site: { values: site, from: siteFrom },
        yard: yard.report,
      }
    : undefined;

  return {
    strip: stackHouseGeometries(
      floors,
      facades.marked.map((geometry, i) => ({ geometry, title: titles[i]! })),
    ),
    site,
    yard: yard.hints,
    ai,
    parking: plain?.model.primitives.filter((p) => p.tag === "yard:car").length ?? 0,
    built: { fence: plain?.model.primitives.filter((p) => p.tag === "yard:fence").length ?? 0, gate: plain?.model.primitives.filter((p) => p.tag === "yard:gate").length ?? 0 },
    counts: plain ? countsFromBuilding(plain).map((f) => f.counts) : null,
  };
}

/**
 * The private-house booklet: three models, one style, one file.
 *
 * Every model is stood up with the house finish — grey and brown plaster,
 * Jerusalem-stone window frames — on the plot its ground floor sheet draws:
 * the garden, the parking bays with their cars, the paving, the stone walls,
 * the gate and the bins, on the land the facades level. Every picture is then
 * painted as a photograph where the painting holds the render, in the
 * innovative haredi style. `load` reads a file by the names above.
 *
 * The vision model reads what the sheets draw but do not write: the
 * facades' level marks, which face each facade is, what the plot's unnamed
 * parts are; and at the end it sets each sheet beside its render. Each
 * reading is used only where the sheets' lines bear it out (house-levels.ts,
 * house-faces.ts, house-yard-ai.ts); the audit is reported, not acted on.
 * `ai: false`, or no key, builds as before.
 */
export async function runPrivateHouseBooklet(input: {
  load: (name: string) => Promise<Buffer>;
  projectName?: string;
  say?: (step: string) => void;
  traceSamples?: number;
  /** Paint the pictures as photographs (paid image calls). */
  photoreal?: boolean;
  /** Read the sheets with the vision model too (a few paid text calls a model). */
  ai?: boolean;
  /** The job's spend, and the budget the painting stops at. */
  spend?: HouseSpend;
  /** The image models the painting asks, and the paintings already held (house-store.ts). */
  paint?: { models?: string[]; cache?: PaintingCache; keep?: (name: string, attempt: number, painting: Buffer) => void; only?: (name: string) => boolean };
  /** Each model as measured, its pictures and its state, before it is painted: what a review is shown and a later painting starts from. */
  measured?: (model: MeasuredHouseModel) => Promise<void>;
  /** Which sheet is which, and what the hand knows of the house (house-project.ts); the Gottlieb house where none is given. */
  project?: HouseProject;
  /** False where the drawings have no parking (a school, an office): the geometry gate then passes with no cars. Default true. */
  requireCars?: boolean;
  /** The vision model's answers already had, by the picture asked about: the same sheets are read as before (house-store.ts). */
  answers?: AnswerMemo;
}): Promise<{ html: string; painted: number; pictures: number }> {
  const say = input.say ?? (() => undefined);
  const useAi = input.ai !== false;
  const project = input.project ?? GOTTLIEB_HOUSE;
  const sheets = houseSheetReader(input.load);
  const groundPlan = await sheets.geometry(project.models[0]!.floors[0]!);
  const { north, northKnown } = await houseNorth({ project, groundPlan, ai: useAi, say });
  const facades = await readHouseFacades({ facades: await sheets.facades(project.facades), groundPlan, ai: useAi, say, project, north, answers: input.answers });
  const style = resolveFloorplanVizStyle(project.style);
  const done: Array<{ name: string; state: BookletState; artefacts: Map<string, Buffer> }> = [];
  let painted = 0;
  let pictures = 0;
  for (const model of project.models) {
    say(model.name);
    const { levels, reading, truth, openings, lawnM2 } = await readHouseModelSheets({ model, project, sheets, facades, ai: useAi, say });
    const projectName = `${input.projectName ?? "בית פרטי"} — ${model.name}`;
    const { state, artefacts } = await runWholeBooklet({
      ...houseStageInput({ model, project, projectName, reading, levels, north, northKnown, ai: useAi, requireCars: input.requireCars, traceSamples: input.traceSamples, say }),
      subtitle: houseSubtitle(style),
      ai: reading.ai,
      beforeAssemble: async (pics) => {
        const audit = useAi ? await auditHouseModel(pics, { name: model.name, reading, north, say }) : undefined;
        pictures += (await paintingPlan(pics, { subject: houseSubject(model.name), style })).names.length;
        if (!input.photoreal) return { audit };
        const gateRaw = pics.get("geometry-gate.json");
        const geometryGate = gateRaw ? (JSON.parse(gateRaw.toString("utf8")) as PlanGeometryGateResult) : undefined;
        if (!geometryGate?.ok) throw new Error(`plan geometry gate missing or blocked before paint (${model.name})`);
        const visualRaw = pics.get("visual-gate.json");
        const visualGate = visualRaw ? (JSON.parse(visualRaw.toString("utf8")) as PlanVisualGateResult) : undefined;
        if (visualGate && !visualGate.ok) throw new Error(`plan visual gate blocked before paint (${model.name})`);
        const done = await paintModel(pics, {
          name: model.name,
          style,
          say,
          spend: input.spend,
          paint: input.paint,
          geometryGate,
          visualGate,
          plansOnly: houseKnob("HOUSE_PAINT_ONLY") === "plans",
          plansReady: readPlansReady(process.cwd()),
        });
        painted += done.painted.length;
        return { painted: done.painted, audit, budget: done.budget };
      },
    });
    if (openings.length) state.openings = openings;
    if (lawnM2 != null) state.lawnM2 = lawnM2;
    await input.measured?.({ id: model.id, name: model.name, projectName, styleId: project.style, state, artefacts, truth });
    done.push({ name: model.name, state, artefacts });
  }
  return { html: await projectBooklet(input.projectName ?? "בית פרטי", houseSubtitle(style), done), painted, pictures };
}

const STANDARD_STOREY_LABEL = "(3.00 m a storey)";

/**
 * Each storey's plan as stood up, counted against what its sheet holds: the
 * CAD layers' inventory where the sheet is a DXF tab, else the vision
 * model's count of the drawing — reported, never acted on. A count off by
 * more than its tolerance is a fault where the CAD says so, a thing to check
 * where only the model does. The CAD's own counts of doors and windows are
 * the booklet's too.
 */
async function checkModelTruth(input: {
  model: HouseProject["models"][number];
  floors: Array<{ geometry: DwfGeometry }>;
  reading: HouseModelReading;
  sheets: ReturnType<typeof houseSheetReader>;
  ai: boolean;
  say: (step: string) => void;
}): Promise<{ findings: Array<TruthFinding & { text: string }>; openings: NonNullable<BookletState["openings"]>; lawnM2: number | null }> {
  const { model, reading, say } = input;
  const out: Array<TruthFinding & { text: string }> = [];
  const openings: NonNullable<BookletState["openings"]> = [];
  let lawnM2: number | null = null;
  for (let storey = 0; storey < model.floors.length; storey++) {
    const ref = model.floors[storey]!;
    const inventory = await input.sheets.inventory(ref).catch(() => null);
    if (inventory) {
      openings.push({ storey, doors: inventory.counts.doorWidths, windows: inventory.counts.windows });
      if (storey === 0 && inventory.counts.lawnM2 > 0) lawnM2 = inventory.counts.lawnM2;
    }
    const counts = reading.counts?.[storey];
    if (!counts) continue;
    const sheet = { name: ref.sheet ?? ref.file, model: model.id, storey };
    let truth = inventory ? truthFromInventory(inventory) : null;
    if (!truth && input.ai) {
      const g = input.floors[storey]!.geometry;
      const image = await dwfSheetJpeg(g, { x: 0, y: 0, width: g.pageWidth, height: g.pageHeight }, 2400);
      truth = await readTruthByAi(image, sheet).catch(() => null);
    }
    if (!truth) continue;
    const found = compareToTruth({ ...truth, sheet: sheet.name, model: model.id, storey }, counts);
    const off = found.filter((f) => f.verdict !== "ok");
    say(`${model.name} truth, storey ${storey} (${truth.source}): ${off.length ? off.map(describeFinding).join("; ") : `${found.length} counts match`}`);
    out.push(...found.map((f) => ({ ...f, text: describeFinding(f) })));
  }
  return { findings: out, openings, lawnM2 };
}

/** What a painting of a house model is asked to show: also what its held paintings are keyed by. */
export function houseSubject(modelName: string): string {
  return `${modelName} — a pair of semi-detached two-storey private family houses in Israel on a gently sloping plot, with their gardens, parking bays, stone garden walls, gate and the street in front`;
}

/** One model as measured: its booklet's state and every picture it holds, by the state's references. */
export type MeasuredHouseModel = {
  id: string;
  name: string;
  projectName: string;
  styleId?: string;
  state: BookletState;
  artefacts: Map<string, Buffer>;
  /** Its storeys counted against their sheets' truth (house-truth.ts). */
  truth?: Array<TruthFinding & { text: string }>;
};

async function paintModel(
  pics: Parameters<typeof paintHousePictures>[0],
  input: {
    name: string;
    style: ReturnType<typeof resolveFloorplanVizStyle>;
    say: (step: string) => void;
    spend?: HouseSpend;
    /** Gate 0 result from measured stage — required before any paid plan paint. */
    geometryGate?: PlanGeometryGateResult;
    /** Gate 1 — pixel QA; when set, must PASS with geometry. */
    visualGate?: PlanVisualGateResult;
    /**
     * When true, only planwhole/plantile jobs run (no elev/room/hero).
     * Default true when HOUSE_PAINT_ONLY=plans.
     */
    plansOnly?: boolean;
    /** Optional project plans-ready — elev paint blocked until ok. */
    plansReady?: PlansReadyFile | null;
    paint?: {
      models?: string[];
      cache?: PaintingCache;
      keep?: (name: string, attempt: number, painting: Buffer) => void;
      only?: (name: string) => boolean;
      references?: (name: string) => { images: Buffer[]; prompt: (first: number, picture: number) => string } | undefined;
      promptExtra?: (name: string) => string | undefined;
    };
  },
): Promise<{ painted: string[]; budget?: { ils: number; unpainted: number } }> {
  if (input.geometryGate) {
    const ready = assertPlanPipelineReady({ geometry: input.geometryGate, visual: input.visualGate });
    if (!ready.ok) throw new Error(`plan pipeline not ready: ${ready.faults.join(", ")}`);
  }
  const prod = assertProductionPlanPaintEnv();
  if (!prod.ok) throw new Error(`production plan paint blocked: ${prod.faults.join(", ")}`);
  const plansOnly = input.plansOnly === true || houseKnob("HOUSE_PAINT_ONLY") === "plans";
  // Elevations / rooms / hero: hard skip until plans-ready, unless HOUSE_PAINT_ONLY=all (explicit override).
  if (!plansOnly && houseKnob("HOUSE_PAINT_ONLY") !== "all") {
    const elev = assertElevationsAllowed(input.plansReady);
    if (!elev.ok) {
      throw new Error("elevations/rooms blocked until plans-ready.json ok (use HOUSE_PAINT_ONLY=plans for plans, or =all after sign-off)");
    }
  }
  const only = plansOnly
    ? (name: string) => housePaintPlansOnly(name) && (input.paint?.only?.(name) ?? true)
    : input.paint?.only;
  const skippedBefore = input.spend?.skipped.length ?? 0;
  const painted = await paintHousePictures(pics, {
    subject: houseSubject(input.name),
    style: input.style,
    say: input.say,
    spend: input.spend,
    models: input.paint?.models,
    cache: input.paint?.cache,
    keep: input.paint?.keep,
    only,
    references: input.paint?.references,
    promptExtra: input.paint?.promptExtra,
    group: input.name,
  });
  const unpainted = (input.spend?.skipped.length ?? 0) - skippedBefore;
  return { painted, budget: input.spend?.stopped && input.spend.budgetIls != null ? { ils: input.spend.budgetIls, unpainted } : undefined };
}

/** A measured model's pictures, as the painter takes them (a painting replaces its render in `artefacts`), and those it would paint. */
async function measuredPictures(model: MeasuredHouseModel) {
  const style = resolveFloorplanVizStyle(model.styleId ?? HOUSE_STYLE);
  const refs = model.state.artefacts ?? {};
  const pics = {
    names: () => Object.keys(refs),
    get: (name: string) => (refs[name] ? model.artefacts.get(refs[name]!) : undefined),
    set: (name: string, data: Buffer) => {
      if (refs[name]) model.artefacts.set(refs[name]!, data);
    },
  };
  const planned = (await paintingPlan(pics, { subject: houseSubject(model.name), style })).names;
  return { style, pics, planned };
}

/**
 * One measured model's pictures painted over their renders, behind the
 * gates: the measured geometry (and pixel QA where it ran), the production
 * paint switches, the plans-ready sign-off for the elevations. `only` paints
 * a few of them (a job's step); the rest keep their renders. Each painting
 * that holds replaces its render in `model.artefacts`.
 */
export async function paintMeasuredModel(
  model: MeasuredHouseModel,
  input: {
    say?: (step: string) => void;
    spend?: HouseSpend;
    only?: (name: string) => boolean;
    images?: {
      models?: string[];
      cache?: PaintingCache;
      references?: (name: string) => { images: Buffer[]; prompt: (first: number, picture: number) => string } | undefined;
      promptExtra?: (name: string) => string | undefined;
    };
  },
): Promise<{ planned: string[]; painted: string[]; budget?: { ils: number; unpainted: number } }> {
  const say = input.say ?? (() => undefined);
  const { style, pics, planned } = await measuredPictures(model);
  say(`${model.name}: painting`);
  const gateRaw = pics.get("geometry-gate.json");
  const geometryGate = gateRaw ? (JSON.parse(gateRaw.toString("utf8")) as PlanGeometryGateResult) : undefined;
  const visualRaw = pics.get("visual-gate.json");
  const visualGate = visualRaw ? (JSON.parse(visualRaw.toString("utf8")) as PlanVisualGateResult) : undefined;
  const result = await paintModel(pics, {
    name: model.name,
    style,
    say,
    spend: input.spend,
    geometryGate,
    visualGate,
    plansOnly: houseKnob("HOUSE_PAINT_ONLY") === "plans",
    plansReady: readPlansReady(process.cwd()),
    paint: {
      models: input.images?.models,
      cache: input.images?.cache,
      references: input.images?.references,
      promptExtra: input.images?.promptExtra,
      only: input.only,
    },
  });
  return { planned, painted: result.painted, budget: result.budget };
}

/**
 * The booklet from models already measured: each model's pictures painted
 * (where `paint`), then its pages put together from its state. The renders
 * painted are the very ones the review showed — nothing is read or drawn
 * again.
 */
export async function finishMeasuredHouse(input: {
  models: MeasuredHouseModel[];
  paint: boolean;
  say?: (step: string) => void;
  spend?: HouseSpend;
  images?: {
    models?: string[];
    cache?: PaintingCache;
    references?: (name: string) => { images: Buffer[]; prompt: (first: number, picture: number) => string } | undefined;
    promptExtra?: (name: string) => string | undefined;
  };
}): Promise<{ html: string; painted: number; pictures: number; unpainted: string[] }> {
  const say = input.say ?? (() => undefined);
  const done: Array<{ name: string; state: BookletState; artefacts: Map<string, Buffer> }> = [];
  const unpainted: string[] = [];
  let painted = 0;
  let pictures = 0;
  for (const model of input.models) {
    const state: BookletState = { ...model.state };
    if (input.paint) {
      const result = await paintMeasuredModel(model, { say, spend: input.spend, images: input.images });
      pictures += result.planned.length;
      painted += result.painted.length;
      state.painted = result.painted;
      if (result.budget) state.budget = result.budget;
      // What the painting did not hold stays the measured render: named, so the job can say which.
      const held = new Set(result.painted);
      unpainted.push(...result.planned.filter((n) => !held.has(n)).map((n) => `${model.name}: ${n}`));
    } else {
      pictures += (await measuredPictures(model)).planned.length;
    }
    done.push({ name: model.name, state, artefacts: model.artefacts });
  }
  const first = input.models[0];
  if (!first) throw new Error("אין דגמים בחוברת");
  say("assembling the booklet");
  const style = resolveFloorplanVizStyle(first.styleId ?? HOUSE_STYLE);
  return { html: await projectBooklet(houseProjectName(first), first.state.subtitle ?? houseSubtitle(style), done), painted, pictures, unpainted };
}
