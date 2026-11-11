/**
 * What every reader filter leaves out, measured on real drawings (free, no model calls).
 *
 *   npx tsx --conditions=react-server scripts/audit-drops.mts <file.dxf> [...more] [--out report.md] [--flat N]
 *
 * For each DXF: the raw read (dxf-drawing), the house reader (dxf-house), the
 * sales-sheet reader (floorplan-dxf: plans → walls/rooms), and the coverage
 * audit's unread layers. `--flat N` also reads flat N by its front door.
 * Prints the drop-log tally (lib/projects/drop-log.ts) per file and per stage.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, flat: { type: "string", multiple: true } },
});
if (!positionals.length) {
  console.error("usage: audit-drops.mts <file.dxf> [...] [--out report.md] [--flat N]");
  process.exit(2);
}

const { resetDrops, dropReport, formatDropReport } = await import("@/lib/projects/drop-log");
const { readDxfDrawing, flattenDxf } = await import("@/lib/projects/dxf-drawing");
const { readDxfHouse } = await import("@/lib/projects/building/dxf-house");
const { readDxfPlans, unitGeometryFromDxf } = await import("@/lib/projects/floorplan-dxf");
const { auditDxf } = await import("@/lib/projects/building/cad-audit");

const lines: string[] = [`# Drop audit — ${new Date().toISOString().slice(0, 16)}`, ""];
const say = (s = "") => {
  console.log(s);
  lines.push(s);
};

async function stage(name: string, run: () => unknown | Promise<unknown>) {
  resetDrops();
  const t0 = Date.now();
  let note = "";
  try {
    const r = await run();
    if (typeof r === "string") note = r;
  } catch (err: unknown) {
    note = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
  const entries = dropReport();
  say(`### ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)${note ? ` — ${note}` : ""}`);
  say("```");
  say(formatDropReport(entries));
  say("```");
}

for (const file of positionals) {
  say(`## ${path.basename(file)}`);
  const bytes = new Uint8Array(readFileSync(file));
  const drawing = readDxfDrawing(bytes);
  if (!drawing) {
    say("unreadable");
    continue;
  }
  await stage("dxf-drawing (flatten model space)", () => `${flattenDxf(drawing).length} pieces`);
  await stage("dxf-house (house reader)", () => {
    const h = readDxfHouse(bytes, { whole: true });
    if (!h) return "no house";
    const s = h.sheets.map((x) => `${x.name}: ${x.inventory.walls.length} walls, ${x.inventory.doors.length} doors, ${x.inventory.windows.length} windows`);
    return s.join("; ");
  });
  await stage("floorplan-dxf (sales-sheet reader)", () => {
    const r = readDxfPlans(drawing, 3);
    return `${r.geometries.length} plan page(s)`;
  });
  await stage("cad-audit (unread layers)", () => {
    const a = auditDxf(bytes, file);
    if (!a) return "no audit";
    const unread = a.unread.map((u) => `${u.layer} ${u.pieces}`).slice(0, 25);
    return `${a.unread.length} unread layer(s): ${unread.join(", ")}`;
  });
  for (const n of values.flat ?? []) {
    await stage(`flat ${n} by its front door`, () => {
      const g = unitGeometryFromDxf(drawing, Number(n));
      return g && "geometry" in (g as object) ? "read" : JSON.stringify(g)?.slice(0, 160) ?? "null";
    });
  }
  say();
}

if (values.out) writeFileSync(values.out, lines.join("\n"));
