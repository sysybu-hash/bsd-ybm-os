#!/usr/bin/env npx tsx
/**
 * One project through runProject — the same engine entry VMB's runner calls (rule 13.1) — on this computer: the files are
 * read from disk and the booklet is written to disk, so nothing leaves the machine (rule 13.11). Free: no image model.
 *
 *   npx tsx --conditions=react-server scripts/studio/run-project.mts <out dir> "<name>" <kind> [--unit N] [--answers a.json] <file> [<file> ...]
 *
 * kind: flat | house | building | industrial | public. answers.json holds the questions form's values ({"floorHeight": 3.1,
 * "furniture": "basic", "views": ["interior"]}); what it leaves out runs on the defaults, said as assumptions.
 * Progress lines go to stdout ("progress <stage> <done>/<total> <detail>"); a stop the client can act on ends with
 * "stop <code>: <message>" and exit code 2.
 */
import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: ".env.local" });
process.env.ALLOW_PAID_AI = "";

const { runProject, realDeps, RunProjectError } = await import("@/lib/projects/pipeline/runProject");
const { projectQuestions, resolveAnswers, cleanAnswers } = await import("@/lib/vmb/questions");

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const unitArg = flag("--unit");
const answersArg = flag("--answers");
const [outDir, projectName, kind, ...paths] = argv;
const KINDS = ["flat", "house", "building", "industrial", "public"] as const;
type Kind = (typeof KINDS)[number];
if (!outDir || !projectName || !kind || !paths.length || !(KINDS as readonly string[]).includes(kind)) {
  throw new Error('usage: <out dir> "<name>" <flat|house|building|industrial|public> [--unit N] [--answers a.json] <file> [<file> ...]');
}
fs.mkdirSync(outDir, { recursive: true });

const KIND_OF_EXT: Record<string, "dxf" | "dwg" | "pdf" | "dwf" | "image"> = { ".dxf": "dxf", ".dwg": "dwg", ".pdf": "pdf", ".dwf": "dwf", ".jpg": "image", ".jpeg": "image", ".png": "image", ".webp": "image" };
const files = paths.map((p) => {
  const fileKind = KIND_OF_EXT[path.extname(p).toLowerCase()];
  if (!fileKind) throw new Error(`סוג קובץ לא נתמך: ${path.basename(p)}`);
  return { relPath: path.basename(p), kind: fileKind, blobUrl: path.resolve(p) };
});

// The same questions the site asks, with no scan facts: the client's answers file, then the defaults.
const questions = projectQuestions(kind as Kind, []);
const given = answersArg ? (JSON.parse(fs.readFileSync(answersArg, "utf8")) as Record<string, unknown>) : {};
const answers = resolveAnswers(questions, cleanAnswers(questions, given));

const unit = unitArg ? Number(unitArg) : undefined;
try {
  const out = await runProject(
    {
      jobId: `local-${Date.now()}`,
      projectId: "local",
      kind: kind as Kind,
      files,
      answers: answers as Parameters<typeof runProject>[0]["answers"],
      layerMaps: {},
      projectName,
      ...(unit != null && Number.isInteger(unit) ? { unit } : {}),
    },
    async (stage, done, total, detail) => console.log(`progress ${stage} ${done}/${total ?? "?"}${detail ? ` ${detail}` : ""}`),
    {
      ...realDeps,
      fetchFile: async (p) => fs.readFileSync(p),
      putBooklet: async (_jobId, pdf) => {
        const to = path.join(outDir, "booklet.pdf");
        fs.writeFileSync(to, pdf);
        return to;
      },
    },
  );
  fs.writeFileSync(path.join(outDir, "quality.json"), JSON.stringify({ warnings: [], notes: out.assumptions }, null, 2));
  console.log(`booklet ${out.bookletUrl}`);
  console.log(`route ${out.route} · ${out.picturesFree} free pictures`);
} catch (err: unknown) {
  if (err instanceof RunProjectError) {
    // The flats the drawing marks travel in detail, not in the message: said here so the Studio shows them.
    console.log(`stop ${err.code}: ${err.message}${err.detail?.units?.length ? ` (${err.detail.units.join(", ")})` : ""}`);
    process.exit(2);
  }
  throw err;
}
