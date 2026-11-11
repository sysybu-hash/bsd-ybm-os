/**
 * What the Pisga route leaves out of the model, counted (free, no model calls).
 *
 *   npx tsx --env-file=../../../.env.local --conditions=react-server scripts/audit-pisga-drops.mts <pisga.dxf> [--survey <survey.dxf>] [--out report.md]
 *
 * Builds the model exactly as render-pisga does (buildPisga with the DXF and,
 * when given, the 2022 survey) and prints every filter's tally from
 * lib/projects/drop-log.ts: what each filter removed, with samples. A drop in
 * a filter that should take nothing is a piece missing from every render.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { out: { type: "string" }, survey: { type: "string" } },
});
const file = positionals[0];
if (!file) {
  process.stderr.write("usage: audit-pisga-drops.mts <pisga.dxf> [--survey <survey.dxf>] [--out report.md]\n");
  process.exit(2);
}

const { resetDrops, dropReport, formatDropReport } = await import("@/lib/projects/drop-log");
const { readDxfDrawing, flattenDxf } = await import("@/lib/projects/dxf-drawing");
const { buildPisga } = await import("@/lib/projects/building/pisga");

const lines: string[] = [`# Pisga drop audit — ${new Date().toISOString().slice(0, 16)}`, "", `DXF: ${file}`, `Survey: ${values.survey ?? "(none)"}`, ""];
const say = (s = "") => {
  process.stdout.write(`${s}\n`);
  lines.push(s);
};

const dxf = readDxfDrawing(new Uint8Array(readFileSync(file)));
if (!dxf) throw new Error(`unreadable DXF: ${file}`);
const survey = values.survey ? readDxfDrawing(new Uint8Array(readFileSync(values.survey))) ?? undefined : undefined;

async function stage(name: string, run: () => Promise<string> | string) {
  resetDrops();
  const t0 = Date.now();
  let note: string;
  try {
    note = await run();
  } catch (err: unknown) {
    note = `FAILED: ${err instanceof Error ? err.message : String(err)}`;
  }
  say(`## ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s) — ${note}`);
  say("```");
  say(formatDropReport(dropReport()));
  say("```");
  say();
}

await stage("raw read: the whole model space flattened", () => `${flattenDxf(dxf).length} pieces`);
if (survey) await stage("raw read: the survey flattened", () => `${flattenDxf(survey).length} pieces`);
await stage("buildPisga (the model the renders use)", async () => {
  const model = await buildPisga(null, { dxf, ...(survey ? { survey } : {}) });
  return `${model.primitives.length} primitives`;
});

if (values.out) writeFileSync(values.out, lines.join("\n"));
