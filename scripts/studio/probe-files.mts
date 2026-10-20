#!/usr/bin/env npx tsx
/**
 * What the platform's house pipeline makes of a set of files, before anything is built: the models and floors it finds, the facades sheet, and what is missing.
 * Prints one JSON line: { ok, models: [{ name, floors }], facades, problems }.
 *
 *   npx tsx --conditions=react-server scripts/studio/probe-files.mts <file> [<file> ...]
 */
import fs from "node:fs";
import path from "node:path";

const { houseProjectFromFiles } = await import("@/lib/projects/building/house-project");
const paths = process.argv.slice(2);
const files = new Map<string, Buffer>();
for (const p of paths) files.set(path.basename(p), fs.readFileSync(p));
const { project, problems } = houseProjectFromFiles(files);
const label = (r: { file: string; sheet?: string }) => (r.sheet ? `${r.file} › ${r.sheet}` : r.file);
console.log(
  "PROBE " +
    JSON.stringify({
      ok: !!project,
      models: project?.models.map((m) => ({ name: m.name, floors: m.floors.map(label) })) ?? [],
      facades: project ? label(project.facades) : null,
      problems,
    }),
);
