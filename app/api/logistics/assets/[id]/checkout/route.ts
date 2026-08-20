import { AssetStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { withWorkspacesAuthDynamic } from "@/lib/api-handler";
import { jsonBadRequest, jsonConflict, jsonNotFound } from "@/lib/api-json";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { createLogger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { requireProjectForOrg } from "@/lib/projects/project-access";
import { assetCheckoutSchema } from "@/lib/validation/schemas/logistics";

export const dynamic = "force-dynamic";

const log = createLogger("logistics-asset-checkout");

const assetInclude = {
  currentUser: { select: { id: true, name: true, email: true } },
  project: { select: { id: true, name: true } },
} as const;

export const POST = withWorkspacesAuthDynamic<{ id: string }, typeof assetCheckoutSchema>(
  async (_req, { orgId, userId }, segment, data) => {
    const { id: assetId } = await segment.params;
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, organizationId: orgId },
    });
    if (!asset) return jsonNotFound("הציוד לא נמצא");

    if (data.action === "CHECK_OUT") {
      if (asset.status !== AssetStatus.AVAILABLE) {
        return jsonConflict("הציוד אינו זמין להחתמה");
      }
      if (!data.userId) {
        return jsonBadRequest("יש לבחור עובד");
      }
      const assignee = await prisma.user.findFirst({
        where: { id: data.userId, organizationId: orgId },
        select: { id: true },
      });
      if (!assignee) return jsonNotFound("העובד לא נמצא בארגון");

      if (data.projectId) {
        const projectGate = await requireProjectForOrg(data.projectId, orgId);
        if (!projectGate.ok) return projectGate.response;
      }

      try {
        const updated = await prisma.$transaction(async (tx) => {
          const row = await tx.asset.update({
            where: { id: asset.id },
            data: {
              status: AssetStatus.IN_USE,
              currentUserId: data.userId,
              projectId: data.projectId ?? null,
            },
            include: assetInclude,
          });
          await tx.assetCheckoutLog.create({
            data: {
              assetId: asset.id,
              organizationId: orgId,
              userId: data.userId,
              projectId: data.projectId ?? null,
              action: "CHECK_OUT",
              notes: data.notes ?? null,
            },
          });
          return row;
        });
        return NextResponse.json(updated);
      } catch (err: unknown) {
        log.error("asset checkout failed", {
          error: err instanceof Error ? err.message : String(err),
          assetId: asset.id,
          actorId: userId,
        });
        return apiErrorResponse(err, "logistics-asset-checkout");
      }
    }

    if (asset.status === AssetStatus.AVAILABLE) {
      return jsonConflict("הציוד כבר במחסן");
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.asset.update({
          where: { id: asset.id },
          data: {
            status: AssetStatus.AVAILABLE,
            currentUserId: null,
            projectId: null,
          },
          include: assetInclude,
        });
        await tx.assetCheckoutLog.create({
          data: {
            assetId: asset.id,
            organizationId: orgId,
            userId: asset.currentUserId,
            projectId: asset.projectId,
            action: "CHECK_IN",
            notes: data.notes ?? null,
          },
        });
        return row;
      });
      return NextResponse.json(updated);
    } catch (err: unknown) {
      log.error("asset check-in failed", {
        error: err instanceof Error ? err.message : String(err),
        assetId: asset.id,
        actorId: userId,
      });
      return apiErrorResponse(err, "logistics-asset-checkin");
    }
  },
  { schema: assetCheckoutSchema },
);
