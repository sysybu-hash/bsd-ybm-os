/**
 * The Project Manifest: the one data structure a project passes through every
 * stage of `runProject` (docs/plans/auto-booklet-vision.md, phase 1). Types
 * only for now — nothing is wired to it yet.
 *
 *   files  → sheets → each sheet's role (plan / elevation / section / survey / site / detail)
 *   model  → storeys, walls, openings, rooms, levels, site — each value with where it came from
 *   drops  → what was read, built, merged and dropped, each drop with its reason
 *            (live research, chapter 0 rule 1: no silent skipping)
 *
 * Every value carries its provenance: read off a sheet, inferred by a named
 * rule, or assumed (a default). The assumed ones are the booklet's
 * assumptions page; a value with no reasonable default is a refusal before
 * the charge, never a silent invention.
 */

/** A file the client uploaded. */
export type ManifestFileKind = "dxf" | "dwg" | "dwf" | "pdf" | "ifc" | "image" | "other";

export type ManifestFile = {
  /** The name as uploaded: never trusted for the role (roles are read by content). */
  name: string;
  kind: ManifestFileKind;
  bytes: number;
  /** Where the bytes are (a store reference or a local path). */
  ref: string;
  sheets: ManifestSheet[];
};

/** What a sheet is, read by its content (door arcs and closed rooms, a ground line, stacked levels, survey codes). */
export type SheetRole = "plan" | "elevation" | "section" | "survey" | "site" | "detail" | "legend" | "permit-form" | "unknown";

export type ManifestSheet = {
  /** A stable id within the project: `<file>#<tab or page>`. */
  id: string;
  /** A DXF tab name, a PDF page number, a DWF strip section. */
  tab?: string;
  page?: number;
  role: Provenanced<SheetRole>;
  /** For a plan: which storey it draws (0 = ground). */
  storey?: Provenanced<number>;
  /** Drawing units to metres, and the print scale where the sheet is a PDF. */
  metresPerUnit?: Provenanced<number>;
  scaleDenominator?: Provenanced<number>;
};

/** Where one value came from. */
export type Provenance =
  /** Read off a sheet: which sheet, and what on it (a layer, a dimension, a level mark). */
  | { source: "sheet"; sheet: string; what?: string }
  /** Inferred from other values by a named rule (a live-research rule number or a code inferrer's id), with its confidence. */
  | { source: "inferred"; rule: string; confidence: number; from?: string[] }
  /** A default: goes on the booklet's assumptions page. `asked` is true where the one upload form offered it to the client. */
  | { source: "assumed"; why: string; asked?: boolean };

export type Provenanced<T> = { value: T; from: Provenance };

export type P2 = [number, number];

/** The unified model every builder reads from, whatever the sheets were. */
export type ManifestModel = {
  storeys: ManifestStorey[];
  /** The roof's and parapet's top, metres above the ground floor. */
  roof?: Provenanced<number>;
  parapet?: Provenanced<number>;
  north?: Provenanced<number>;
  site?: ManifestSite;
};

export type ManifestStorey = {
  index: number;
  /** Finished floor level, metres above the ground floor's. */
  level: Provenanced<number>;
  height: Provenanced<number>;
  walls: Array<{ id: string; a: P2; b: P2; thickness: Provenanced<number>; kind?: "external" | "internal" | "parapet" | "fence"; from: Provenance }>;
  openings: Array<{ id: string; wall: string; kind: "door" | "window" | "opening"; at: number; width: Provenanced<number>; height?: Provenanced<number>; sill?: Provenanced<number>; from: Provenance }>;
  rooms: Array<{ id: string; outline: P2[]; use?: Provenanced<string>; areaM2: number; from: Provenance }>;
};

export type ManifestSite = {
  outline?: Provenanced<P2[]>;
  /** Ground heights: survey points or a TIN, metres. */
  ground?: Array<{ p: P2; z: number; from: Provenance }>;
  roads?: Array<{ outline: P2[]; from: Provenance }>;
  parking?: Provenanced<number>;
};

/** What became of the things read: the balance that must close (read = built + merged + dropped). */
export type DropBalance = {
  /** Per kind of thing (a layer's entities, rooms, doors, fences…). */
  kinds: Record<string, DropKind>;
};

export type DropKind = {
  read: number;
  built: number;
  merged: number;
  dropped: number;
  /** Each drop, with its reason: no drop without one. */
  drops: Array<{ sheet: string; what: string; reason: string }>;
};

/** The pipeline's stages, in order. */
export type PipelineStage = "files" | "roles" | "read" | "model" | "gate-geometry" | "render" | "gate-accuracy" | "paint" | "gate-drift" | "assemble";

/** What a stage reports while it runs: how far it is (a job's progress bar, the bench's timing). */
export type ProgressCallback = (stage: PipelineStage, done: number, total: number) => void;

/** One stage's outcome, as the manifest keeps it. */
export type StageRecord = {
  stage: PipelineStage;
  status: "ok" | "skipped" | "refused" | "failed";
  /** Why it was refused or failed: the reason the client is told before any charge. */
  reason?: string;
  ms?: number;
};

export type ProjectManifest = {
  version: 1;
  name: string;
  files: ManifestFile[];
  model: ManifestModel;
  drops: DropBalance;
  stages: StageRecord[];
  /** What the one upload form answered; every question has a default, so this may be empty. */
  answers?: Record<string, string | number | boolean>;
};
