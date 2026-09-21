import { prisma } from "@/lib/prisma";
import type { UsageGroupRow } from "@/lib/ai-cost-summary";

/** The site's usage in a range, grouped in the database — one row per feature, model, customer and environment. */
export async function groupAiUsage(range: { from: Date; to: Date }): Promise<{
  rows: UsageGroupRow[];
  firstEventAt: Date | null;
  organizationNames: Record<string, string>;
}> {
  const [groups, first] = await Promise.all([
    prisma.aiUsageEvent.groupBy({
      by: ["feature", "model", "organizationId", "environment"],
      where: { createdAt: { gte: range.from, lt: range.to } },
      _count: { _all: true },
      _sum: { inputTokens: true, outputTokens: true, imageTokens: true, outputImages: true },
    }),
    prisma.aiUsageEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
  ]);
  const rows: UsageGroupRow[] = groups.map((group) => ({
    feature: group.feature,
    model: group.model,
    organizationId: group.organizationId,
    environment: group.environment,
    calls: group._count._all,
    inputTokens: group._sum.inputTokens ?? 0,
    outputTokens: group._sum.outputTokens ?? 0,
    imageTokens: group._sum.imageTokens ?? 0,
    outputImages: group._sum.outputImages ?? 0,
  }));
  const ids = [...new Set(rows.map((row) => row.organizationId).filter((id): id is string => Boolean(id)))];
  const orgs = ids.length
    ? await prisma.organization.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  return {
    rows,
    firstEventAt: first?.createdAt ?? null,
    organizationNames: Object.fromEntries(orgs.map((org) => [org.id, org.name])),
  };
}
