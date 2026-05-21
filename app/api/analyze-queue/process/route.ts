import type { NextRequest } from "next/server";
import { assertAnalyzeQueueProcessAuthorized } from "@/lib/analyze-queue";
import { jsonUnauthorized } from "@/lib/api-json";
import { drainDocumentScanQueue } from "@/lib/analyze-queue-runner";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const log = createLogger("cron/analyze-queue");

async function runDrain(req: NextRequest) {
  if (!assertAnalyzeQueueProcessAuthorized(req)) {
    return jsonUnauthorized("גישה נדחתה — אימות תור לא תקין.");
  }
  return Sentry.withMonitor(
    "cron-analyze-queue",
    async () => {
      const start = Date.now();
      const count = await drainDocumentScanQueue(30);
      log.info("analyze_queue_drained", { count, ms: Date.now() - start });
      return Response.json({ ok: true, processed: count > 0, count });
    },
    { schedule: { type: "crontab", value: "15 6 * * *" }, timezone: "Asia/Jerusalem" },
  );
}

export async function GET(req: NextRequest) { return runDrain(req); }
export async function POST(req: NextRequest) { return runDrain(req); }
