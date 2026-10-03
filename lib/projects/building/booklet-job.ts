import { Client } from "@upstash/qstash";

import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import type { BookletState } from "@/lib/projects/building/dwf-booklet";

const log = createLogger("building-booklet-job");

/**
 * A building booklet made on the platform, one function call at a time.
 *
 * A call takes the job (a lock in the row, so two calls never run one job),
 * runs stages until its budget is spent, keeps the pictures in Blob under the
 * job's own name and its place in the row, and lets go. QStash calls again
 * when it is configured; the page that asked for the booklet calls again
 * while it is open — either way the job goes on where it stopped, and a call
 * that finds the job taken goes away.
 */

/*
 * The job's rows, read and written here; the stages themselves — the
 * renderer, Chromium, the PDF — in booklet-job-run.ts, so that a function
 * that only reads a job's state does not carry the engine that draws it.
 */

export type BookletJobView = {
  id: string;
  name: string;
  status: string;
  stage: string;
  resultUrl: string | null;
  error: string | null;
  createdAt: Date;
  progress: { views: number; apartments: number; apartmentsTotal: number };
};

function view(row: { id: string; name: string; status: string; stage: string; resultUrl: string | null; error: string | null; createdAt: Date; state: unknown }): BookletJobView {
  const state = (row.state ?? {}) as BookletState;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    stage: row.stage,
    resultUrl: row.resultUrl,
    error: row.error,
    createdAt: row.createdAt,
    progress: { views: state.viewsDone?.length ?? 0, apartments: state.apartments?.length ?? 0, apartmentsTotal: state.units?.length ?? 0 },
  };
}

export async function createBookletJob(input: { orgId: string; userId: string; projectId?: string | null; name: string; subtitle?: string; sourceUrl: string }): Promise<BookletJobView> {
  const row = await prisma.buildingBookletJob.create({
    data: {
      organizationId: input.orgId,
      userId: input.userId,
      projectId: input.projectId ?? null,
      name: input.name,
      sourceUrl: input.sourceUrl,
      state: { subtitle: input.subtitle ?? "" },
    },
  });
  return view(row);
}

export async function getBookletJob(orgId: string, id: string): Promise<BookletJobView | null> {
  const row = await prisma.buildingBookletJob.findFirst({ where: { id, organizationId: orgId } });
  return row ? view(row) : null;
}

export async function listBookletJobs(orgId: string): Promise<BookletJobView[]> {
  const rows = await prisma.buildingBookletJob.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 10 });
  return rows.map(view);
}

function appBaseUrl(): string {
  const explicit = env.QSTASH_TARGET_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const site = env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXTAUTH_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  if (env.VERCEL_URL?.trim()) return `https://${env.VERCEL_URL.trim().replace(/^https?:\/\//, "")}`;
  return "http://127.0.0.1:3000";
}

/** Ask QStash to make the next call; without it, the open page makes it. */
export async function scheduleNextStep(id: string): Promise<boolean> {
  const token = env.QSTASH_TOKEN?.trim();
  const secret = env.CRON_SECRET?.trim();
  if (!token || !secret) return false;
  try {
    await new Client({ token }).publishJSON({
      url: `${appBaseUrl()}/api/cron/building-booklet-step?id=${encodeURIComponent(id)}`,
      body: { id },
      headers: { Authorization: `Bearer ${secret}` },
      retries: 2,
    });
    return true;
  } catch (err: unknown) {
    log.warn("next booklet step not scheduled; the page will drive it", { id, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
