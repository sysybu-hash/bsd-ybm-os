/**
 * Run the identify step over plan files on this machine and print what each
 * is read as. Calls no model: this is the check that the free step tells a
 * flat from a building, a house, a shop floor and a site before anything is
 * produced.
 *
 *   npx tsx --conditions=react-server scripts/identify-plans.mts <file|dir>... [--group a,b,c]
 *
 * A directory is read file by file. `--group` reads the named files as one
 * upload (a house's storeys and facades).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { identifyStructure } from "@/lib/projects/structure/identify";

const EXT = /\.(pdf|dxf|dwf|w2d|dwg)$/i;
const args = process.argv.slice(2);
const groups: string[][] = [];
const singles: string[] = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--group") groups.push(args[++i]!.split(","));
  else singles.push(args[i]!);
}
const files = singles.flatMap((p) =>
  statSync(p).isDirectory()
    ? readdirSync(p).filter((n) => EXT.test(n)).map((n) => path.join(p, n))
    : [p],
);

async function show(label: string, paths: string[]) {
  const started = Date.now();
  try {
    const report = await identifyStructure(paths.map((p) => ({ name: path.basename(p), bytes: readFileSync(p) })));
    const floors = report.plans.filter((p) => p.kind === "floor");
    const open = floors.filter((p) => !p.blocked);
    console.log(
      [
        label,
        report.structure + (report.sure ? "" : "?"),
        `${report.plans.length} plans, ${floors.length} floors, ${open.length} usable`,
        open.slice(0, 4).map((p) => `${p.title ?? p.id}${p.closedM2 != null ? ` ${Math.round(p.closedM2)}m²` : ""}`).join(" | "),
        `${((Date.now() - started) / 1000).toFixed(1)}s`,
      ].join("  ·  "),
    );
    for (const r of report.reasons) console.log(`      ${r}`);
    for (const b of report.blockers) console.log(`    ✗ ${b}`);
  } catch (err: unknown) {
    console.log(`${label}  ·  ERROR ${err instanceof Error ? err.message : String(err)}`);
  }
}

for (const f of files) await show(path.basename(f), [f]);
for (const g of groups) await show(`[${g.map((p) => path.basename(p)).join(" + ")}]`, g);
