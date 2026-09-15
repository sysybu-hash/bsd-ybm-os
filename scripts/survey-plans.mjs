#!/usr/bin/env node
/**
 * The geometry stage across every plan in the folder, measured against the truth.
 *
 *   npm run floorplan:survey
 *
 * No model calls, so it is free and can be run on every change. This is the
 * regression the project had been missing: every threshold in the pipeline was
 * tuned on דירה 14, and the ten sheets are not variations of one another —
 * they run 57 to 114 m², two to four bedrooms, one to three terraces, and four
 * of them put a terrace a storey above the flat.
 *
 * Only same-level terraces are added to the area the scale is locked against. A
 * roof terrace is drawn on the same sheet but is not on the flat's floor plate,
 * and adding its area to the target skews the lock — on דירה 20 that would be
 * 19.65 m² of it.
 */
import fs from "node:fs";
import path from "node:path";

const DIR = "תוכניות לביצוע הדמיות";
const truth = JSON.parse(
  fs.readFileSync(path.join("scripts", "floorplan-truth.json"), "utf8"),
);

const { extractFloorplanVectorGeometry, extractPrintedAreas, wallBoundingBox } =
  await import("../lib/projects/floorplan-vector.ts");
const { hatchedWallExtent } = await import("../lib/projects/floorplan-solid.ts");
const { buildFlatFromPdf } = await import("../lib/projects/floorplan-build.ts");
const { segmentRooms } = await import("../lib/projects/floorplan-segment.ts");

const args = process.argv.slice(2);
const grossOnly = args.includes("--gross-only");
const only = args.find((a) => !a.startsWith("--"));
const rows = [];

for (const plan of truth.plans) {
  if (only && !plan.file.includes(only)) continue;
  const name = plan.file.replace(/\.pdf$/, "").trim();
  const cutPath = path.join(DIR, plan.file);
  if (!fs.existsSync(cutPath)) {
    rows.push({ name, note: "MISSING FILE" });
    continue;
  }
  const cutBytes = fs.readFileSync(cutPath);
  const wallSource = plan.uncut
    ? fs.readFileSync(path.join(DIR, plan.uncut))
    : cutBytes;

  let cut = null;
  try {
    cut = await extractFloorplanVectorGeometry(cutBytes);
  } catch (err) {
    rows.push({ name, note: `extract failed: ${String(err).slice(0, 40)}` });
    continue;
  }
  if (!cut) {
    rows.push({ name, note: "no vector data" });
    continue;
  }

  // Same-level terraces only: a roof terrace is not on this floor plate.
  const sameLevel = plan.terraces.filter(
    (t) => Math.abs(t.levelM - plan.levelM) < 0.01,
  );
  const roof = plan.terraces.length - sameLevel.length;
  const target = grossOnly
    ? plan.grossM2
    : plan.grossM2 + sameLevel.reduce((sum, t) => sum + t.m2, 0);

  const sheet = wallBoundingBox(cut);
  const extent = sheet ? hatchedWallExtent(cut.segments, sheet, 54) : null;
  let built = null;
  try {
    built = await buildFlatFromPdf(wallSource, target, {
      extent: extent ?? undefined,
    });
  } catch (err) {
    rows.push({ name, note: `build failed: ${String(err).slice(0, 40)}` });
    continue;
  }
  if (!built) {
    rows.push({ name, note: "no scale lock", target: target.toFixed(2) });
    continue;
  }

  const kinds = {};
  for (const piece of built.furniture) {
    kinds[piece.kind] = (kinds[piece.kind] ?? 0) + 1;
  }
  const printed = (await extractPrintedAreas(cutBytes)).map((a) => a.value);
  // A single bed is 200 cm long. It checks the scale without going through the
  // printed area, which is the only other thing the lock has to go on.
  const bedLengths = built.furniture
    .filter((p) => p.kind === "bed")
    .map((p) => Math.max(p.widthCm, p.depthCm))
    .sort((a, b) => a - b);
  const bedCm = bedLengths.length
    ? Math.round(bedLengths[bedLengths.length >> 1])
    : null;

  const rooms = segmentRooms({
    bodies: built.bodies,
    openings: built.openings,
    floor: built.floor,
    furniture: built.furniture,
    terraces: built.terraces,
    bounds: built.bounds,
    unitsPerMetre: built.unitsPerMetre,
    segments: cut.segments,
  });
  const roomKinds = {};
  for (const room of rooms) {
    roomKinds[room.kind] = (roomKinds[room.kind] ?? 0) + 1;
  }
  const bedrooms = (roomKinds.bedroom ?? 0) + (roomKinds.mmd ?? 0);
  const bathrooms = roomKinds.bathroom ?? 0;
  const wantBed = plan.bedrooms + plan.mmd;
  const wantBath = plan.bathrooms;
  const fail = [];
  if (bedrooms !== wantBed) fail.push(`bedrooms ${bedrooms}≠${wantBed}`);
  if (bathrooms !== wantBath) fail.push(`bathrooms ${bathrooms}≠${wantBath}`);
  if (built.terraces.length !== sameLevel.length) {
    fail.push(`terraces ${built.terraces.length}≠${sameLevel.length}`);
  }

  rows.push({
    name,
    file: plan.file,
    upm: built.unitsPerMetre,
    target: target.toFixed(2),
    areaErr: `${(built.areaError * 100).toFixed(1)}%`,
    walls: built.bodies.length,
    openings: built.openings.length,
    beds: kinds.bed ?? 0,
    seats: kinds.seat ?? 0,
    tables: kinds.table ?? 0,
    bedCm,
    terrFound: built.terraces.length,
    terrSame: sameLevel.length,
    terrRoof: roof,
    printed: printed.join(",") || "-",
    bedRm: `${bedrooms}/${wantBed}`,
    bath: `${bathrooms}/${wantBath}`,
    spend: 0,
    fail: fail.join("; "),
    bedrooms,
    bathrooms,
    terraces: built.terraces.length,
  });
}

const cols = [
  ["plan", (r) => r.name],
  ["u/m", (r) => r.upm ?? "-"],
  ["target", (r) => r.target ?? "-"],
  ["areaErr", (r) => r.areaErr ?? "-"],
  ["walls", (r) => r.walls ?? "-"],
  ["doors", (r) => r.openings ?? "-"],
  ["beds", (r) => r.beds ?? "-"],
  ["seats", (r) => r.seats ?? "-"],
  ["tbl", (r) => r.tables ?? "-"],
  ["bedCm", (r) => r.bedCm ?? "-"],
  ["terr", (r) => (r.terrFound == null ? "-" : `${r.terrFound}/${r.terrSame}`)],
  ["roof", (r) => r.terrRoof ?? "-"],
  ["bedRm", (r) => r.bedRm ?? "-"],
  ["bath", (r) => r.bath ?? "-"],
  ["spend", (r) => r.spend ?? 0],
  ["printed", (r) => r.printed ?? "-"],
  ["fail", (r) => r.fail ?? r.note ?? ""],
];

const widths = cols.map(([head, get]) =>
  Math.max(head.length, ...rows.map((r) => String(get(r)).length)),
);
const line = (cells) =>
  cells.map((c, i) => String(c).padEnd(widths[i])).join("  ");
console.log(line(cols.map(([h]) => h)));
console.log(widths.map((w) => "-".repeat(w)).join("  "));
for (const row of rows) console.log(line(cols.map(([, get]) => get(row))));

const failed = rows.filter((r) => r.note);
console.log(
  `\n${rows.length - failed.length}/${rows.length} plans reached a scale lock` +
    (failed.length ? `; failed: ${failed.map((r) => r.name).join(", ")}` : ""),
);

const MIRRORS = [
  ["14", "15"],
  ["16", "17"],
  ["20", "21"],
  ["22", "23"],
];
const byNum = (n) =>
  rows.find((r) => r.name.includes(n) && r.bedrooms != null);
for (const [a, b] of MIRRORS) {
  const left = byNum(a);
  const right = byNum(b);
  if (!left || !right) continue;
  if (
    left.bedrooms !== right.bedrooms ||
    left.bathrooms !== right.bathrooms ||
    left.terraces !== right.terraces
  ) {
    const msg = `mirror ${left.name}↔${right.name}: rooms/terraces differ`;
    console.error(msg);
    left.fail = [left.fail, msg].filter(Boolean).join("; ");
    right.fail = [right.fail, msg].filter(Boolean).join("; ");
  }
}

const mismatches = rows.filter((r) => r.fail);
if (mismatches.length) {
  console.error(
    `\n${mismatches.length} plan(s) failed the truth table: ${mismatches.map((r) => r.name).join(", ")}`,
  );
  process.exit(1);
}
