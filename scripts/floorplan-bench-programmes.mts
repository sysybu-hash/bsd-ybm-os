/**
 * The programme each reference sheet was read as in production, for the CAD
 * bench.
 *
 *   npm run floorplan:bench-programmes -- programmes.json
 *
 * In production the measured route is handed the layout the model read off
 * the sheet — each room's name, area and box — and a terrace the lines alone
 * cannot close is seeded from that box and checked against its area. The
 * bench ran without it, so it measured a harder problem than production
 * solves. This writes, per sheet, the saved run whose layout places the most
 * terraces, from runs of that exact file only: a box is a fraction of the
 * page it was read from, and an uncut sheet's page is not the cut one's.
 *
 * Reads the database named in .env.local; writes nothing to it.
 */
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";

const target = process.argv[2] ?? "floorplan-bench-programmes.json";
const truth = JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-truth.json", "utf8")) as {
  plans: Array<{ file: string }>;
};
const runs = await prisma.floorplanVizRun.findMany({
  where: { sourceFileName: { in: truth.plans.map((plan) => plan.file) } },
  orderBy: { createdAt: "desc" },
  select: { id: true, sourceFileName: true, createdAt: true, layoutJson: true },
});
const placedTerraces = (layout: FloorplanLayout) =>
  (layout.rooms ?? []).filter((room) => room.kind === "balcony" && room.bbox != null).length;

const out: Record<string, { runId: string; createdAt: string; layout: FloorplanLayout }> = {};
for (const run of runs) {
  const layout = run.layoutJson as unknown as FloorplanLayout | null;
  if (!layout?.rooms?.length || !run.sourceFileName) continue;
  const kept = out[run.sourceFileName];
  if (kept && placedTerraces(kept.layout) >= placedTerraces(layout)) continue;
  out[run.sourceFileName] = { runId: run.id, createdAt: run.createdAt.toISOString(), layout };
}
fs.writeFileSync(target, JSON.stringify(out, null, 1));
for (const [file, row] of Object.entries(out)) {
  console.log(file, row.runId, row.createdAt.slice(0, 10), "placed terraces", placedTerraces(row.layout));
}
await prisma.$disconnect();
