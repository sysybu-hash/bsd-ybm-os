import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("health");

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const APP_VERSION = process.env.npm_package_version ?? "1.0.0";

/**
 * Public liveness/readiness probe for uptime monitors and load balancers.
 * Returns 200 when the app + database are reachable, 503 otherwise.
 * Intentionally unauthenticated and lightweight (single `SELECT 1`).
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      {
        status: "ok",
        version: APP_VERSION,
        db: "up",
        latencyMs: Date.now() - startedAt,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("health check failed", { error: message });
    return NextResponse.json(
      {
        status: "degraded",
        version: APP_VERSION,
        db: "down",
        timestamp: new Date().toISOString(),
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
