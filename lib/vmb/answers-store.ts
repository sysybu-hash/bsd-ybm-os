import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { VMB_PROJECT_KINDS, vmbScanFactsSchema, type VmbProjectKind } from "@/lib/validation/schemas/vmb-projects";
import { projectsOfUser } from "@/lib/vmb/projects";
import { cleanAnswers, projectQuestions, resolveAnswers, type Answer, type Question, type QuestionId } from "@/lib/vmb/questions";
import type { ScanFacts } from "@/lib/vmb/scan";

/** What the questions form shows: the questions, the values they run with now, and whether the user has confirmed. */
export type QuestionsState = { questions: Question[]; resolved: Record<QuestionId, Answer>; confirmedAt: string | null };

const asObject = (v: Prisma.JsonValue | null | undefined): Prisma.JsonObject => (v && typeof v === "object" && !Array.isArray(v) ? (v as Prisma.JsonObject) : {});
const kindOf = (k: string): VmbProjectKind => (VMB_PROJECT_KINDS as readonly string[]).includes(k) ? (k as VmbProjectKind) : "building";

/** The latest round's facts per file; a row whose facts do not parse is skipped. */
export function factsOf(scans: Array<{ fileName: string; round: number; facts: Prisma.JsonValue | null }>): ScanFacts[] {
  const latest = new Map<string, { round: number; facts: Prisma.JsonValue | null }>();
  for (const s of scans) if (!latest.has(s.fileName) || latest.get(s.fileName)!.round < s.round) latest.set(s.fileName, s);
  return [...latest.values()].flatMap((s) => {
    const p = vmbScanFactsSchema.safeParse(s.facts);
    return p.success ? [p.data] : [];
  });
}

/** The form for a project already loaded with its kind, manifest and scans. */
export function questionsState(project: { kind: string; manifest: Prisma.JsonValue | null; scans: Array<{ fileName: string; round: number; facts: Prisma.JsonValue | null }> }): QuestionsState {
  const questions = projectQuestions(kindOf(project.kind), factsOf(project.scans));
  const manifest = asObject(project.manifest);
  const saved = cleanAnswers(questions, asObject(manifest.answers));
  const confirmedAt = typeof manifest.answersConfirmedAt === "string" ? manifest.answersConfirmedAt : null;
  return { questions, resolved: resolveAnswers(questions, saved), confirmedAt };
}

/**
 * Saves the form: only answers that fit their question are kept (the rest fall back to the file or the default), the time
 * of confirming is stamped, and a project waiting on its questions moves on to its cost.
 */
export async function saveAnswers(userId: string, projectId: string, input: Record<string, unknown>): Promise<QuestionsState | null> {
  const project = await prisma.vmbProject.findFirst({
    where: { id: projectId, ...projectsOfUser(userId) },
    select: { id: true, kind: true, status: true, manifest: true, scans: { select: { fileName: true, round: true, facts: true } } },
  });
  if (!project) return null;
  const questions = projectQuestions(kindOf(project.kind), factsOf(project.scans));
  const answers = cleanAnswers(questions, input);
  const manifest = { ...asObject(project.manifest), answers, answersConfirmedAt: new Date().toISOString() };
  const next = project.status === "draft" || project.status === "identified" ? "answered" : project.status;
  await prisma.vmbProject.update({ where: { id: project.id }, data: { manifest, status: next } });
  return questionsState({ ...project, manifest });
}

export type SetUnitResult = { ok: true } | { ok: false; code: "not_found" | "running" | "not_offered" };

/**
 * The flat to build on a whole-floor drawing. When the engine stopped and named the flats it found, only one of those is
 * taken; the stop is then cleared and the project is ready to start again.
 */
export async function setUnit(userId: string, projectId: string, unit: number): Promise<SetUnitResult> {
  const project = await prisma.vmbProject.findFirst({ where: { id: projectId, ...projectsOfUser(userId) }, select: { id: true, status: true, manifest: true } });
  if (!project) return { ok: false, code: "not_found" };
  if (project.status === "running") return { ok: false, code: "running" };
  const manifest: Prisma.JsonObject = { ...asObject(project.manifest) };
  const stop = asObject(manifest.stop as Prisma.JsonValue);
  const offered = Array.isArray(stop.units) ? stop.units.filter((u): u is number => typeof u === "number") : [];
  if (offered.length && !offered.includes(unit)) return { ok: false, code: "not_offered" };
  manifest.unit = unit;
  delete manifest.stop;
  await prisma.vmbProject.update({ where: { id: project.id }, data: { manifest } });
  return { ok: true };
}
