import type { NextRequest } from "next/server";
import { Client } from "@upstash/qstash";
import { assertAnalyzeQueueProcessAuthorized } from "@/lib/analyze-queue";
import { jsonUnauthorized } from "@/lib/api-json";
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";
import { cleanupOldScanJobFileData } from "@/lib/scan-job-cleanup";
import { env } from "@/lib/env";
import { isQStashConfigured } from "@/lib/qstash-fanout";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("cron/analyze-queue");

function processBaseUrl(): string {
  const explicit = process.env.QSTASH_TARGET_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const site = env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXTAUTH_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  if (env.VERCEL_URL?.trim()) return `https://${env.VERCEL_URL.trim().replace(/^https?:\/\//, "")}`;
  return "http://127.0.0.1:3000";
}

async function maybeScheduleFollowUpDrain() {
  const token = process.env.QSTASH_TOKEN?.trim();
  const secret =
    process.env.ANALYZE_QUEUE_SECRET?.trim() || env.CRON_SECRET?.trim();
  if (!isQStashConfigured() || !token || !secret) return;

  try {
    const client = new Client({ token });
    const url = `${processBaseUrl()}/api/analyze-queue/process?batch=10&nofollowup=1`;
    await client.publishJSON({
      url,
      body: { source: "qstash" },
      headers: { Authorization: `Bearer ${secret}` },
      delay: 60,
    });
    log.info("analyze_queue_qstash_followup_scheduled");
  } catch (err) {
    log.warn("analyze_queue_qstash_followup_failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function runDrain(req: NextRequest) {
  if (!assertAnalyzeQueueProcessAuthorized(req)) {
    return jsonUnauthorized("גישה נדחתה — אימות תור לא תקין.");
  }

  const batchRaw = Number.parseInt(req.nextUrl.searchParams.get("batch") ?? "30", 10);
  const limit = Number.isFinite(batchRaw) ? Math.min(Math.max(batchRaw, 1), 30) : 30;
  const noFollowup = req.nextUrl.searchParams.get("nofollowup") === "1";

  return Sentry.withMonitor(
    "cron-analyze-queue",
    async () => {
      const start = Date.now();
      const count = await drainDocumentScanQueue(limit);
      const cleaned = await cleanupOldScanJobFileData();
      if (!noFollowup && count > 0) {
        await maybeScheduleFollowUpDrain();
      }
      log.info("analyze_queue_drained", { count, cleaned, ms: Date.now() - start, limit });
      return Response.json({ ok: true, processed: count > 0, count, cleaned, limit });
    },
    { schedule: { type: "crontab", value: "15 6 * * *" }, timezone: "Asia/Jerusalem" },
  );
}

export async function GET(req: NextRequest) {
  return runDrain(req);
}
export async function POST(req: NextRequest) {
  return runDrain(req);
}
