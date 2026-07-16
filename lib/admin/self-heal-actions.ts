import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { embedText, isEmbeddingConfigured } from "@/lib/embeddings/gemini-embed";
import { writeKnowledgeVaultChunkEmbedding } from "@/lib/embeddings/pgvector-dual-write";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin/self-heal");

export const SELF_HEAL_ACTIONS = [
  "purge_stale_rate_limits",
  "recount_org_usage",
  "requeue_failed_embeddings",
] as const;

export type SelfHealAction = (typeof SELF_HEAL_ACTIONS)[number];

export function isSelfHealAction(value: string): value is SelfHealAction {
  return (SELF_HEAL_ACTIONS as readonly string[]).includes(value);
}

export type SelfHealResult = {
  action: SelfHealAction;
  dryRun: boolean;
  affected: number;
  details: Record<string, unknown>;
};

const STALE_RATE_LIMIT_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EMBED_REQUEUE = 50;

export async function runSelfHealAction(
  action: SelfHealAction,
  dryRun: boolean,
  organizationId?: string,
): Promise<SelfHealResult> {
  switch (action) {
    case "purge_stale_rate_limits":
      return purgeStaleRateLimits(dryRun);
    case "recount_org_usage":
      return recountOrgUsage(dryRun, organizationId);
    case "requeue_failed_embeddings":
      return requeueFailedEmbeddings(dryRun, organizationId);
    default:
      throw new Error(`unknown action: ${action satisfies never}`);
  }
}

async function purgeStaleRateLimits(dryRun: boolean): Promise<SelfHealResult> {
  const cutoff = new Date(Date.now() - STALE_RATE_LIMIT_MS);
  const stale = await prisma.rateLimit.count({
    where: { resetAt: { lt: cutoff } },
  });

  if (!dryRun && stale > 0) {
    const deleted = await prisma.rateLimit.deleteMany({
      where: { resetAt: { lt: cutoff } },
    });
    return {
      action: "purge_stale_rate_limits",
      dryRun: false,
      affected: deleted.count,
      details: { cutoff: cutoff.toISOString(), staleBefore: stale },
    };
  }

  return {
    action: "purge_stale_rate_limits",
    dryRun,
    affected: stale,
    details: { cutoff: cutoff.toISOString(), wouldDelete: stale },
  };
}

async function recountOrgUsage(
  dryRun: boolean,
  organizationId?: string,
): Promise<SelfHealResult> {
  const automations = await prisma.automation.findMany({
    where: organizationId ? { organizationId } : undefined,
    select: {
      id: true,
      organizationId: true,
      runCount: true,
      _count: { select: { runs: true } },
    },
    take: 500,
  });

  const mismatches = automations.filter((a) => a.runCount !== a._count.runs);
  let fixed = 0;

  if (!dryRun) {
    for (const a of mismatches) {
      await prisma.automation.update({
        where: { id: a.id },
        data: { runCount: a._count.runs },
      });
      fixed++;
    }
  }

  return {
    action: "recount_org_usage",
    dryRun,
    affected: dryRun ? mismatches.length : fixed,
    details: {
      automationsChecked: automations.length,
      mismatches: mismatches.slice(0, 20).map((a) => ({
        id: a.id,
        organizationId: a.organizationId,
        stored: a.runCount,
        actual: a._count.runs,
      })),
    },
  };
}

async function requeueFailedEmbeddings(
  dryRun: boolean,
  organizationId?: string,
): Promise<SelfHealResult> {
  if (!isEmbeddingConfigured()) {
    return {
      action: "requeue_failed_embeddings",
      dryRun,
      affected: 0,
      details: { skipped: true, reason: "embeddings_not_configured" },
    };
  }

  const rows = await prisma.knowledgeVaultChunk.findMany({
    where: {
      ...(organizationId ? { organizationId } : {}),
      embedding: { equals: Prisma.DbNull },
      NOT: { content: "" },
    },
    select: { id: true, content: true, organizationId: true },
    take: MAX_EMBED_REQUEUE,
  });

  if (dryRun) {
    return {
      action: "requeue_failed_embeddings",
      dryRun: true,
      affected: rows.length,
      details: { wouldRequeue: rows.length, sampleIds: rows.slice(0, 10).map((r) => r.id) },
    };
  }

  let updated = 0;
  for (const row of rows) {
    const vec = await embedText(row.content);
    if (!vec) continue;
    await prisma.knowledgeVaultChunk.update({
      where: { id: row.id },
      data: { embedding: vec },
    });
    await writeKnowledgeVaultChunkEmbedding(row.id, vec);
    updated++;
  }

  log.info("requeue_failed_embeddings done", { updated, candidates: rows.length });
  return {
    action: "requeue_failed_embeddings",
    dryRun: false,
    affected: updated,
    details: { candidates: rows.length, updated },
  };
}

export async function logSelfHealAudit(
  adminEmail: string,
  adminUserId: string | null,
  result: SelfHealResult,
): Promise<void> {
  if (!adminUserId) return;

  const user = await prisma.user.findUnique({
    where: { id: adminUserId },
    select: { organizationId: true },
  });
  if (!user?.organizationId) return;

  await prisma.activityLog.create({
    data: {
      userId: adminUserId,
      organizationId: user.organizationId,
      action: `SELF_HEAL_${result.action.toUpperCase()}`,
      details: JSON.stringify({
        adminEmail,
        dryRun: result.dryRun,
        affected: result.affected,
        details: result.details,
      }).slice(0, 4000),
    },
  });
}
