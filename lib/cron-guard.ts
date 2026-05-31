/**
 * lib/cron-guard.ts
 *
 * Shared utilities for Vercel cron route handlers:
 * 1. Auth guard — rejects requests without the CRON_SECRET Bearer token
 * 2. Sentry Crons monitoring — reports check-in / failure to Sentry
 * 3. Structured logging — start / success / failure with timing
 */

import type { NextRequest } from "next/server";
import { env } from "@/lib/env";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { createLogger } from "./logger";

const log = createLogger("cron");

export type CronSchedule =
  | { type: "crontab"; value: string }
  | { type: "interval"; value: number; unit: "minute" | "hour" | "day" };

export type CronRunResult = Record<string, unknown>;

/**
 * Wraps a cron handler with:
 * - CRON_SECRET auth check
 * - Sentry Crons check-in (start → ok / error)
 * - Timing + structured logging
 *
 * @example
 * export async function GET(req: NextRequest) {
 *   return withCronGuard(req, "financial-insights", { type: "crontab", value: "0 6 * * *" }, async () => {
 *     await runDailyInsightsForAllOrganizations();
 *     return { ran: true };
 *   });
 * }
 */
export async function withCronGuard(
  req: NextRequest | Request,
  monitorSlug: string,
  schedule: CronSchedule,
  handler: () => Promise<CronRunResult>,
): Promise<NextResponse> {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = env.CRON_SECRET?.trim();
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    log.warn("cron_auth_failed", { slug: monitorSlug });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Run with Sentry Crons ─────────────────────────────────────────────────
  const start = Date.now();
  log.info("cron_start", { slug: monitorSlug });

  try {
    const result = await Sentry.withMonitor(
      monitorSlug,
      handler,
      {
        schedule,
        checkinMargin: 5,      // 5 min grace for late check-in
        maxRuntime: 25,        // warn if running > 25 min
        timezone: "Asia/Jerusalem",
      },
    );

    const ms = Date.now() - start;
    log.info("cron_success", { slug: monitorSlug, ms, ...result });
    return NextResponse.json({ ok: true, ms, ...result });
  } catch (err) {
    const ms = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    log.error("cron_failure", { slug: monitorSlug, ms, error: message });
    Sentry.captureException(err, { tags: { cron: monitorSlug } });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
