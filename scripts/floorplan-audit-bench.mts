#!/usr/bin/env npx tsx
/**
 * How often each audit rule is right, on stills a person labelled.
 *
 *   npm run floorplan:audit-bench -- saved out.json
 *       Scores the findings already saved on each still. Free: it only reads.
 *
 *   FLOORPLAN_AUDIT_BENCH_SPEND=1 npm run floorplan:audit-bench -- live out.json 3
 *       Audits each labelled still 3 times now (Gemini, and Claude when
 *       configured) and scores every scan, including how often they disagree.
 *       Every scan is a paid model call, so it refuses to run without the
 *       variable.
 *
 *   npm run floorplan:audit-bench -- list
 *       Lists the runs each label's title matches, to pin one with runId.
 *
 * Labels: e2e/fixtures/floorplan-audit-bench/labels.json. The stills are read
 * from the database the environment points at, by run title, view and attempt.
 * Nothing is written to it.
 */
import fs from "node:fs";

import { prisma } from "@/lib/prisma";
import {
  answerFromAudit,
  answerFromClaude,
  answerFromFindings,
  answerWhenBothAgree,
  auditBenchLabelsSchema,
  formatAuditBench,
  scoreAuditBench,
  type AuditBenchAnswer,
  type AuditBenchCase,
} from "@/lib/projects/floorplan-audit-bench";
import { parseFloorplanLayout } from "@/lib/projects/floorplan-layout";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";
import { emptyFloorplanSpend, formatFloorplanSpend, runWithFloorplanSpend } from "@/lib/projects/floorplan-spend";
import { unpackFloorplanVizStillMeta } from "@/lib/projects/floorplan-viz-ids";
import { gradeStillForShip } from "@/lib/projects/viz-generate/audit-gate";

const mode = process.argv[2];
const target = process.argv[3] ?? "floorplan-audit-bench.json";
const repeats = Math.max(1, Math.min(10, Number(process.argv[4] ?? 3) || 3));
if (mode !== "saved" && mode !== "live" && mode !== "list") {
  console.error("usage: floorplan-audit-bench (list|saved|live) out.json [repeats]");
  process.exit(2);
}
if (mode === "live" && process.env.FLOORPLAN_AUDIT_BENCH_SPEND !== "1") {
  console.error("live mode makes paid model calls; set FLOORPLAN_AUDIT_BENCH_SPEND=1 to run it");
  process.exit(2);
}

const labels = auditBenchLabelsSchema.parse(
  JSON.parse(fs.readFileSync("e2e/fixtures/floorplan-audit-bench/labels.json", "utf8")),
);

/** The labelled still and its run, selected column by column so nothing extra is read. */
async function loadCase(label: AuditBenchCase) {
  const runs = await prisma.floorplanVizRun.findMany({
    where: label.still.runId ? { id: label.still.runId } : { title: label.still.runTitle },
    select: { id: true, planBase64: true, planMimeType: true, layoutJson: true, styleKitJson: true },
  });
  if (runs.length !== 1) {
    throw new Error(`${label.id}: ${runs.length} runs titled "${label.still.runTitle}"; expected exactly one`);
  }
  const run = runs[0]!;
  const still = await prisma.floorplanVizStill.findFirst({
    where: {
      runId: run.id,
      viewId: label.still.viewId,
      roomName: label.still.roomName ?? null,
      attemptIndex: label.still.attempt,
    },
    select: { dataBase64: true, mimeType: true, editPrompt: true },
  });
  if (!still) throw new Error(`${label.id}: no attempt ${label.still.attempt} of ${label.still.viewId}`);
  return { run, still };
}

async function planPicture(run: { planBase64: string; planMimeType: string }) {
  if (run.planMimeType.startsWith("image/")) return { mimeType: run.planMimeType, base64: run.planBase64 };
  const jpeg = await rasterizePdfPageJpeg(Buffer.from(run.planBase64, "base64"));
  if (!jpeg) throw new Error("the run's plan could not be rasterised");
  return { mimeType: "image/jpeg", base64: jpeg };
}

if (mode === "list") {
  for (const title of new Set(labels.cases.map((c) => c.still.runTitle))) {
    const runs = await prisma.floorplanVizRun.findMany({
      where: { title },
      select: { id: true, organizationId: true, updatedAt: true, _count: { select: { stills: true } } },
      orderBy: { updatedAt: "desc" },
    });
    console.log(`"${title}":`);
    for (const run of runs) {
      console.log(`  ${run.id}  org ${run.organizationId}  ${run._count.stills} stills  ${run.updatedAt.toISOString()}`);
    }
  }
  await prisma.$disconnect();
  process.exit(0);
}

const spend = emptyFloorplanSpend();
type Scored = Array<{ label: AuditBenchCase; answers: AuditBenchAnswer[] }>;
const results: Scored = [];
// Live scans are also scored per auditor, so a rule can be set on which of
// them to believe: Gemini alone, the Claude second judge alone, or both.
const byAuditor: Record<"gemini" | "claude" | "both", Scored> = { gemini: [], claude: [], both: [] };
for (const label of labels.cases) {
  const { run, still } = await loadCase(label);
  if (mode === "saved") {
    const findings = unpackFloorplanVizStillMeta(still.editPrompt).auditIssues ?? [];
    results.push({ label, answers: [answerFromFindings(findings)] });
    continue;
  }
  const plan = await planPicture(run);
  const layout = parseFloorplanLayout(run.layoutJson as Record<string, unknown>);
  const style = run.styleKitJson as { audience?: string } | null;
  const answers: AuditBenchAnswer[] = [];
  const gemini: AuditBenchAnswer[] = [];
  const claude: AuditBenchAnswer[] = [];
  const both: AuditBenchAnswer[] = [];
  for (let i = 0; i < repeats; i += 1) {
    const scored = await runWithFloorplanSpend(spend, () =>
      gradeStillForShip(
        { mimeType: still.mimeType, base64: still.dataBase64 },
        { layout, plan, haredi: style?.audience === "haredi" },
      ),
    );
    if (!scored) continue;
    answers.push(answerFromAudit(scored.audit));
    const g = answerFromAudit(scored.gemini);
    gemini.push(g);
    if (scored.claude) {
      const c = answerFromClaude(scored.claude);
      claude.push(c);
      both.push(answerWhenBothAgree(g, c));
    }
  }
  results.push({ label, answers });
  byAuditor.gemini.push({ label, answers: gemini });
  byAuditor.claude.push({ label, answers: claude });
  byAuditor.both.push({ label, answers: both });
  console.log(`${label.id}: ${answers.length}/${repeats} scans`);
}

const score = scoreAuditBench(results);
const perAuditor =
  mode === "live"
    ? {
        gemini: scoreAuditBench(byAuditor.gemini),
        claude: scoreAuditBench(byAuditor.claude),
        both: scoreAuditBench(byAuditor.both),
      }
    : undefined;
const draft = labels.cases.filter((c) => c.status === "draft").length;
fs.writeFileSync(
  target,
  JSON.stringify({ mode, repeats: mode === "live" ? repeats : 1, score, perAuditor, results, byAuditor }, null, 1),
);
console.log("merged (what the gate sees):");
console.log(formatAuditBench(score));
if (perAuditor) {
  for (const [name, s] of Object.entries(perAuditor)) {
    console.log(`
${name}:`);
    console.log(formatAuditBench(s));
  }
}
if (draft > 0) console.log(`\n${draft} of ${labels.cases.length} cases are still draft labels.`);
if (mode === "live") console.log(formatFloorplanSpend(spend));
// The AI cost ledger writes its rows after the calls return; give it a moment
// before the connection closes, or the audits never reach the ledger.
if (mode === "live") await new Promise((resolve) => setTimeout(resolve, 3000));
await prisma.$disconnect();
