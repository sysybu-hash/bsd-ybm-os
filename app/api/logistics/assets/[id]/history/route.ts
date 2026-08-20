import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { applyRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const log = createLogger("logistics-asset-history");

export const GET = withWorkspacesAuthDynamic<{ id: string }>(async (req, { orgId }, segment) => {
  const limited = await applyRateLimit(req, "logistics:asset-history", 60, 60_000);
  if (limited) return limited;

  const { id: assetId } = await segment.params;

  try {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, organizationId: orgId },
      select: { id: true, name: true },
    });
    if (!asset) return jsonNotFound("הציוד לא נמצא");

    const logs = await prisma.assetCheckoutLog.findMany({
      where: { assetId, organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const userIds = [...new Set(logs.map((l) => l.userId).filter((uid): uid is string => Boolean(uid)))];
    const projectIds = [...new Set(logs.map((l) => l.projectId).filter((pid): pid is string => Boolean(pid)))];

    const [users, projects] = await Promise.all([
      userIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true },
          })
        : [],
      projectIds.length > 0
        ? prisma.project.findMany({
            where: { id: { in: projectIds }, organizationId: orgId },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const userById = new Map(users.map((u) => [u.id, u]));
    const projectById = new Map(projects.map((p) => [p.id, p]));

    return Response.json({
      logs: logs.map((entry) => {
        const user = entry.userId ? userById.get(entry.userId) : undefined;
        const project = entry.projectId ? projectById.get(entry.projectId) : undefined;
        return {
          id: entry.id,
          action: entry.action,
          timestamp: entry.createdAt.toISOString(),
          notes: entry.notes,
          user: user
            ? { name: user.name ?? user.email ?? "" }
            : null,
          project: project ? { name: project.name } : null,
        };
      }),
    });
  } catch (err: unknown) {
    log.error("Failed to fetch asset history", {
      error: err instanceof Error ? err.message : String(err),
      assetId,
      orgId,
    });
    return apiErrorResponse(err, "logistics-asset-history");
  }
});
