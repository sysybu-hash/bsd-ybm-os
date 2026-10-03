import { createLogger } from "@/lib/logger";
import { renderHtmlSectionsPdf } from "@/lib/pdf/render-html-pdf-chromium";
import { prisma } from "@/lib/prisma";
import { BUILDING_BOOKLET_PAGE } from "@/lib/projects/building/booklet-html";
import { getBookletJob, scheduleNextStep, type BookletJobView } from "@/lib/projects/building/booklet-job";
import { runBookletStage, type ArtefactStore, type BookletStage, type BookletState } from "@/lib/projects/building/dwf-booklet";
import { isFloorplanBlobUrl } from "@/lib/projects/floorplan-blob";

const log = createLogger("building-booklet-job");

/**
 * A building booklet's stages, run one function call at a time (see
 * booklet-job.ts). Kept apart from the job's rows: this is the half that
 * carries the renderer, Chromium and the PDF, and only the functions that
 * advance a job import it.
 */

/** A call runs stages for this long; the function is allowed 300 s. */
const BUDGET_MS = 200_000;
/** The lock outlives a call by a margin, so a call that died is not waited on long. */
const LOCK_MS = 290_000;
/** The assembly draws the PDF, which wants a call of its own. */
const ASSEMBLE_NEEDS_MS = 60_000;

/** The job's pictures, in Blob under its own name. */
function blobStore(jobId: string): ArtefactStore {
  return {
    async put(name, data, contentType) {
      const { put } = await import("@vercel/blob");
      const blob = await put(`building-booklets/${jobId}/${name}`, data, { access: "public", contentType, addRandomSuffix: true });
      return blob.url;
    },
    async get(ref) {
      if (!isFloorplanBlobUrl(ref)) throw new Error("artefact is not on the project's blob host");
      const res = await fetch(ref, { cache: "no-store" });
      if (!res.ok) throw new Error(`artefact fetch failed: ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    },
  };
}

async function deleteBlobs(urls: string[]): Promise<void> {
  const mine = urls.filter(isFloorplanBlobUrl);
  if (mine.length === 0) return;
  try {
    const { del } = await import("@vercel/blob");
    await del(mine);
  } catch (err: unknown) {
    log.warn("booklet artefacts not deleted; they will age out", { error: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * One call's worth of the job. Answers what the job is now, or null when
 * another call holds it (or it is finished, or not this organisation's).
 */
export async function advanceBookletJob(id: string, orgId?: string): Promise<BookletJobView | null> {
  const started = Date.now();
  const claimed = await prisma.buildingBookletJob.updateMany({
    where: {
      id,
      ...(orgId ? { organizationId: orgId } : {}),
      status: { in: ["queued", "running"] },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: new Date(started) } }],
    },
    data: { status: "running", lockedUntil: new Date(started + LOCK_MS) },
  });
  if (claimed.count === 0) return null;
  const job = await prisma.buildingBookletJob.findUniqueOrThrow({ where: { id } });
  const store = blobStore(id);
  let stage = job.stage as BookletStage;
  let state = (job.state ?? {}) as BookletState;
  let source: Buffer | null = null;
  try {
    while (stage !== "done") {
      const elapsed = Date.now() - started;
      if (elapsed > BUDGET_MS || (stage === "assemble" && elapsed > BUDGET_MS - ASSEMBLE_NEEDS_MS * 2)) break;
      const result = await runBookletStage({
        stage,
        state,
        projectName: job.name,
        store,
        deadline: started + BUDGET_MS,
        source: async () => {
          if (source) return source;
          if (!isFloorplanBlobUrl(job.sourceUrl)) throw new Error("source is not on the project's blob host");
          const res = await fetch(job.sourceUrl, { cache: "no-store" });
          if (!res.ok) throw new Error("קובץ הגרמושקה שהועלה אינו זמין עוד");
          source = Buffer.from(await res.arrayBuffer());
          return source;
        },
        say: (step) => log.info("booklet step", { id, stage, step }),
      });
      stage = result.stage;
      state = result.state;
      if (result.html) {
        const pdf = await renderHtmlSectionsPdf(result.html, { waitForImages: true, timeoutMs: 200_000, sheet: BUILDING_BOOKLET_PAGE, jpegQuality: 86 });
        const resultUrl = await store.put(`${job.name.replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || "booklet"}.pdf`, Buffer.from(pdf), "application/pdf");
        await prisma.buildingBookletJob.update({ where: { id }, data: { status: "done", stage: "done", state: { ...state, artefacts: {} }, resultUrl, lockedUntil: null } });
        // The booklet holds every picture now; the pictures and the upload are rubbish.
        await deleteBlobs([...Object.values(state.artefacts ?? {}), job.sourceUrl]);
        log.info("booklet done", { id, ms: Date.now() - started });
        return getBookletJob(job.organizationId, id);
      }
      await prisma.buildingBookletJob.update({ where: { id }, data: { stage, state } });
    }
    await prisma.buildingBookletJob.update({ where: { id }, data: { stage, state, lockedUntil: null } });
    await scheduleNextStep(id);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("booklet step failed", { id, stage, error: message });
    await prisma.buildingBookletJob.update({ where: { id }, data: { status: "failed", error: message.slice(0, 500), lockedUntil: null } });
  }
  return getBookletJob(job.organizationId, id);
}
