import "server-only";
import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { appBaseUrl } from "@/lib/projects/building/booklet-job";

const log = createLogger("vmb-run-queue");

/** The route the queue calls for one job (app/api/cron/vmb-job). */
export const VMB_JOB_PATH = "/api/cron/vmb-job";

/**
 * Asks QStash to run this job now, in its own function call: jobs run side by side, and nothing polls the database
 * while the queue is empty. Without QStash (or if it refuses), false: the sweeper cron takes the job later.
 */
export async function dispatchRun(jobId: string): Promise<boolean> {
  const token = env.QSTASH_TOKEN?.trim();
  const secret = env.CRON_SECRET?.trim();
  if (!token || !secret) return false;
  try {
    await new Client({ token }).publishJSON({
      url: `${appBaseUrl()}${VMB_JOB_PATH}?job=${encodeURIComponent(jobId)}`,
      body: { jobId },
      headers: { Authorization: `Bearer ${secret}` },
      // A retry finds the job already taken and does nothing; one covers a cold start that failed.
      retries: 1,
    });
    return true;
  } catch (err: unknown) {
    log.warn("run not queued; the sweeper will take it", { jobId, error: err instanceof Error ? err.message : String(err) });
    return false;
  }
}
