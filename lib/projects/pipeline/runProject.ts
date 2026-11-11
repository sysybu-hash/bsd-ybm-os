/**
 * One project from its uploaded files to a booklet: the engine's single entry
 * for a queued job (VMB's runner), the same pipelines the site and Studio run
 * (rule 13.1). The runner takes the job, reports progress and settles the
 * credits; this file only reads, builds, renders and puts the booklet.
 *
 * Routes, by what was uploaded:
 *   - flat, one DXF:            the measured flat (unitByDoors → scene → free raster frames → flat booklet). No paid call.
 *   - house / public / industrial / building, several DXF/DWF sheets with a facades sheet: the private-house booklet, unpainted.
 *   - building, one DWF strip:  the DWF building booklet, unpainted.
 * Anything else stops with a RunProjectError naming why, before any picture is made.
 *
 * Painting is not wired here yet: every picture is a free render (picturesFree), none is painted, so no credit is spent.
 */
import { createLogger } from "@/lib/logger";
import type { CadKind } from "@/lib/projects/building/cad-layers";
import { isFloorplanBlobUrl } from "@/lib/projects/floorplan-blob";
import { flatBookletHtml } from "@/lib/projects/pipeline/flat-booklet";
import { flatSheetPage, isFlatFailure, measureFlatFromDxf, renderFlatPictures, UNITS_M, type DrawingUnit } from "@/lib/projects/pipeline/flat-measured";

const log = createLogger("run-project");

export type RunKind = "flat" | "house" | "building" | "industrial" | "public";
export type RunFileKind = "dxf" | "dwg" | "pdf" | "dwf" | "image";
export type AnswerId = "units" | "floorHeight" | "facade" | "north" | "surroundings" | "furniture" | "views";
export type RunAnswer = { value: string | number | string[]; source: "sheet" | "inferred" | "user" | "default"; from?: string };

export type RunInput = {
  jobId: string;
  projectId: string;
  kind: RunKind;
  files: Array<{ relPath: string; kind: RunFileKind; blobUrl: string }>;
  answers: Record<AnswerId, RunAnswer>;
  /** Layers the client confirmed in the rescan, by file then layer. */
  layerMaps: Record<string, Record<string, CadKind>>;
  /** The booklet's name; the first file's name when absent. */
  projectName?: string;
  /** A flat on a whole-floor DXF: its number. May be left out when the drawing marks one flat only. */
  unit?: number;
};

export type RunStage = "read" | "build" | "render" | "paint" | "booklet";
export type Report = (stage: RunStage, done: number, total?: number, detail?: string) => Promise<void>;

export type RunOutput = {
  bookletUrl: string;
  picturesPainted: number;
  picturesFree: number;
  /** Rule 13.2: everything the run took as given and the client did not say, in Hebrew. */
  assumptions: string[];
  /** Which pipeline ran. */
  route: "flat-dxf" | "house" | "building-dwf";
  /** Answers this route has no use for (they did not change the booklet). */
  unusedAnswers: AnswerId[];
};

export type RunProjectErrorCode = "no-files" | "fetch-failed" | "unsupported" | "needs-conversion" | "unit-needed" | "not-readable";

/** A stop the client can act on: the runner shows `message` (Hebrew) and returns the credits. */
export class RunProjectError extends Error {
  constructor(
    readonly code: RunProjectErrorCode,
    message: string,
    readonly detail?: { units?: number[] },
  ) {
    super(message);
    this.name = "RunProjectError";
  }
}

/** What the run reaches outside itself; real ones by default, fakes in tests. */
export type RunDeps = {
  fetchFile(url: string): Promise<Buffer>;
  putBooklet(jobId: string, pdf: Buffer): Promise<string>;
  htmlToPdf(html: string): Promise<Buffer>;
  /** The house and DWF building pipelines, unpainted: their booklet's HTML and how many pictures it holds. */
  house(files: Map<string, Buffer>, projectName: string, say: (step: string) => void): Promise<{ html: string; pictures: number; notes: string[] }>;
  buildingDwf(bytes: Buffer, projectName: string, say: (step: string) => void): Promise<{ html: string; pictures: number }>;
};

const MAX_FILE_BYTES = 200 * 1024 * 1024;

const realDeps: RunDeps = {
  async fetchFile(url) {
    if (!isFloorplanBlobUrl(url)) throw new RunProjectError("fetch-failed", "קובץ שלא נמצא באחסון של הפרויקט");
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new RunProjectError("fetch-failed", `הקובץ לא נקרא מהאחסון (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength > MAX_FILE_BYTES) throw new RunProjectError("fetch-failed", "הקובץ גדול מדי");
    return buf;
  },
  async putBooklet(jobId, pdf) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`vmb-booklets/${jobId}/booklet.pdf`, pdf, { access: "public", contentType: "application/pdf", addRandomSuffix: true });
    return blob.url;
  },
  async htmlToPdf(html) {
    const { renderHtmlSectionsPdf } = await import("@/lib/pdf/render-html-pdf-chromium");
    const { BUILDING_BOOKLET_PAGE } = await import("@/lib/projects/building/booklet-html");
    return Buffer.from(await renderHtmlSectionsPdf(html, { waitForImages: true, timeoutMs: 200_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 }));
  },
  async house(files, projectName, say) {
    const { houseProjectFromFiles } = await import("@/lib/projects/building/house-project");
    const { runPrivateHouseBooklet } = await import("@/lib/projects/building/house-booklet");
    const { project, problems } = houseProjectFromFiles(files);
    if (!project) throw new RunProjectError("unsupported", `אי אפשר לבנות את המבנה מהקבצים: ${problems.join(" · ")}`);
    const out = await runPrivateHouseBooklet({
      load: async (n) => {
        const b = files.get(n);
        if (!b) throw new Error(`file not among the uploaded: ${n}`);
        return b;
      },
      projectName,
      ai: false,
      photoreal: false,
      project,
      say,
    });
    return { html: out.html, pictures: out.pictures, notes: problems };
  },
  async buildingDwf(bytes, projectName, say) {
    const { runWholeBooklet } = await import("@/lib/projects/building/dwf-booklet");
    const out = await runWholeBooklet({ projectName, source: async () => bytes, say });
    const pictures = Object.keys(out.state.artefacts ?? {}).filter((n) => /^view-.*\.jpg$|^apt-/.test(n)).length;
    return { html: out.html, pictures };
  },
};

const NAMES: Record<AnswerId, string> = {
  units: "יחידות השרטוט",
  floorHeight: "גובה קומה",
  facade: "חזית",
  north: "צפון",
  surroundings: "סביבה",
  furniture: "ריהוט",
  views: "מבטים",
};
const shown = (v: RunAnswer["value"]) => (Array.isArray(v) ? v.join(", ") : String(v));

/** Rule 13.2: an answer the client did not give is an assumption, said as such. */
export function answerAssumptions(answers: Partial<Record<AnswerId, RunAnswer>>, used: AnswerId[]): string[] {
  return used.flatMap((id) => {
    const a = answers[id];
    if (!a || a.source === "user") return [];
    const why = a.source === "default" ? "ברירת מחדל" : a.source === "inferred" ? `הוסק${a.from ? ` (${a.from})` : ""}` : `מהגיליון${a.from ? ` (${a.from})` : ""}`;
    return [`${NAMES[id]}: ${shown(a.value)} — ${why}`];
  });
}

const fileName = (relPath: string) => relPath.split(/[\\/]/).pop() ?? relPath;

/** Which route the files and the kind take, or why none does. */
export function chooseRoute(kind: RunKind, files: RunInput["files"]): { route: RunOutput["route"]; files: RunInput["files"] } {
  const cad = files.filter((f) => f.kind === "dxf" || f.kind === "dwf");
  const dwg = files.filter((f) => f.kind === "dwg");
  if (!files.length) throw new RunProjectError("no-files", "לא הועלו קבצים");
  if (kind === "flat") {
    const dxf = files.filter((f) => f.kind === "dxf");
    if (dxf.length === 1) return { route: "flat-dxf", files: dxf };
    if (dxf.length > 1) throw new RunProjectError("unsupported", "דירה נבנית מקובץ DXF אחד; הועלו כמה");
    if (dwg.length) throw new RunProjectError("needs-conversion", "קובץ DWG צריך המרה ל־DXF לפני הבנייה");
    throw new RunProjectError("unsupported", "דירה מ־PDF או מתמונה עדיין לא נבנית בלי קריאה בתשלום; צריך קובץ DXF");
  }
  if (kind === "building" && cad.length === 1 && cad[0]!.kind === "dwf") return { route: "building-dwf", files: cad };
  if (cad.length >= 2) return { route: "house", files: cad };
  if (dwg.length) throw new RunProjectError("needs-conversion", "קבצי DWG צריכים המרה ל־DXF לפני הבנייה");
  throw new RunProjectError("unsupported", "המבנה נבנה מגיליונות DXF/DWF (תוכניות קומה וגיליון חזיתות); קבצי PDF או תמונות עדיין לא נבנים");
}

export async function runProject(input: RunInput, report: Report, deps: RunDeps = realDeps): Promise<RunOutput> {
  const { route, files } = chooseRoute(input.kind, input.files);
  const projectName = input.projectName?.trim() || fileName(files[0]!.relPath).replace(/\.[^.]+$/, "");
  log.info("run", { jobId: input.jobId, route, files: files.length });

  const bytes = new Map<string, Buffer>();
  for (const [i, f] of files.entries()) {
    bytes.set(f.relPath, await deps.fetchFile(f.blobUrl));
    await report("read", i + 1, files.length, fileName(f.relPath));
  }

  if (route === "flat-dxf") {
    const file = files[0]!;
    const units = input.answers.units?.value;
    const height = Number(input.answers.floorHeight?.value);
    const furniture = input.answers.furniture?.value;
    const views = input.answers.views?.value;
    const flat = measureFlatFromDxf({
      bytes: bytes.get(file.relPath)!,
      unit: input.unit,
      layerMap: input.layerMaps[file.relPath],
      units: typeof units === "string" && units in UNITS_M ? (units as DrawingUnit) : undefined,
      storeyHeightM: Number.isFinite(height) && height > 0 ? height : undefined,
      furniture: furniture === "none" || furniture === "basic" || furniture === "full" ? furniture : undefined,
      interiors: Array.isArray(views) ? views.includes("interior") : true,
    });
    if (isFlatFailure(flat)) {
      throw new RunProjectError(flat.reason === "unit-needed" ? "unit-needed" : "not-readable", flat.message, { units: flat.units });
    }
    await report("build", 1, 1, `${flat.scene.rooms.length} חדרים, ${flat.scene.openings.length} פתחים`);
    const page = await flatSheetPage(bytes.get(file.relPath)!, flat.unit);
    const pictures = await renderFlatPictures(flat, (id, done, total) => report("render", done, total, id));
    // The units answer counts only where the drawing's header gave none (the flat then says so itself).
    const used: AnswerId[] = [...(flat.unitsFromAnswer ? (["units"] as const) : []), "floorHeight", "furniture", "views"];
    const assumptions = [...answerAssumptions(input.answers, used.filter((id) => id !== "units")), ...flat.assumptions];
    const html = await flatBookletHtml({ projectName, unit: flat.unit, scene: flat.scene, views: flat.views, pictures, page, assumptions });
    const bookletUrl = await deps.putBooklet(input.jobId, await deps.htmlToPdf(html));
    await report("booklet", 1, 1);
    return { bookletUrl, picturesPainted: 0, picturesFree: pictures.size, assumptions, route, unusedAnswers: (Object.keys(NAMES) as AnswerId[]).filter((k) => !used.includes(k)) };
  }

  // The house and DWF pipelines read heights, north and the site off the sheets themselves; the answers do not reach them yet.
  const say = (step: string) => void report("build", 0, undefined, step).catch(() => undefined);
  const out =
    route === "house"
      ? await deps.house(new Map([...bytes].map(([k, v]) => [fileName(k), v])), projectName, say)
      : { ...(await deps.buildingDwf(bytes.get(files[0]!.relPath)!, projectName, say)), notes: [] as string[] };
  await report("render", out.pictures, out.pictures);
  const bookletUrl = await deps.putBooklet(input.jobId, await deps.htmlToPdf(out.html));
  await report("booklet", 1, 1);
  const layersGiven = Object.keys(input.layerMaps).length > 0;
  return {
    bookletUrl,
    picturesPainted: 0,
    picturesFree: out.pictures,
    assumptions: [
      ...out.notes,
      "גובהי הקומות, הצפון והחצר נקראו מהגיליונות עצמם; תשובות השאלון לא שימשו במסלול הזה",
      ...(layersGiven ? ["השכבות שאושרו בסריקה הנוספת עדיין לא משמשות במסלול הזה; השכבות נקראו לפי פרופיל המשרד"] : []),
    ],
    route,
    unusedAnswers: Object.keys(NAMES) as AnswerId[],
  };
}
