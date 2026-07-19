import { Client } from "@upstash/qstash";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("qstash-fanout");

const DEFAULT_BATCH = 25;

export function isQStashConfigured(): boolean {
  return Boolean(process.env.QSTASH_TOKEN?.trim());
}

function appBaseUrl(): string {
  const explicit = process.env.QSTASH_TARGET_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const site = env.NEXT_PUBLIC_SITE_URL?.trim() || env.NEXTAUTH_URL?.trim();
  if (site) return site.replace(/\/$/, "");
  if (env.VERCEL_URL?.trim()) return `https://${env.VERCEL_URL.trim().replace(/^https?:\/\//, "")}`;
  return "http://127.0.0.1:3000";
}

export async function listOrganizationIds(opts?: {
  cursor?: string;
  take?: number;
}): Promise<{ ids: string[]; nextCursor: string | null }> {
  const take = opts?.take ?? DEFAULT_BATCH;
  const rows = await prisma.organization.findMany({
    select: { id: true },
    orderBy: { id: "asc" },
    take,
    ...(opts?.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const ids = rows.map((r) => r.id);
  const nextCursor = ids.length === take ? (ids[ids.length - 1] ?? null) : null;
  return { ids, nextCursor };
}

/**
 * Publish one QStash job per org to the same cron path with ?orgId=.
 * Falls back to no-op when QSTASH_TOKEN is missing (caller runs inline batch).
 */
export async function publishOrgFanout(
  path: string,
  orgIds: string[],
): Promise<{ published: number; skipped: boolean }> {
  const token = process.env.QSTASH_TOKEN?.trim();
  const cronSecret = env.CRON_SECRET?.trim();
  if (!token || !cronSecret || orgIds.length === 0) {
    return { published: 0, skipped: true };
  }

  const client = new Client({ token });
  const base = appBaseUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  let published = 0;

  for (const orgId of orgIds) {
    const url = `${base}${normalizedPath}?orgId=${encodeURIComponent(orgId)}`;
    try {
      await client.publishJSON({
        url,
        body: { orgId },
        headers: {
          Authorization: `Bearer ${cronSecret}`,
        },
      });
      published += 1;
    } catch (err) {
      log.warn("qstash_publish_failed", {
        orgId,
        path: normalizedPath,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  log.info("qstash_fanout_done", { path: normalizedPath, published, total: orgIds.length });
  return { published, skipped: false };
}

/**
 * If QStash is configured and no orgId was provided, fan-out a batch and return a result.
 * Otherwise return null so the caller runs the existing inline batch processor.
 */
export async function maybeFanOutOrgCron(opts: {
  path: string;
  orgId?: string;
  cursor?: string;
  take?: number;
}): Promise<Record<string, unknown> | null> {
  if (opts.orgId || !isQStashConfigured()) return null;
  const { ids, nextCursor } = await listOrganizationIds({
    cursor: opts.cursor,
    take: opts.take ?? DEFAULT_BATCH,
  });
  const { published, skipped } = await publishOrgFanout(opts.path, ids);
  if (skipped) return null;
  return {
    mode: "qstash_fanout",
    published,
    nextCursor,
    partial: Boolean(nextCursor),
  };
}
