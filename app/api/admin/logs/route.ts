import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonServerError } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("admin-logs");

export const GET = withWorkspacesAuth(
  async (_req, { orgId }) => {
    try {
      const logs = await prisma.activityLog.findMany({
        where: { organizationId: orgId },
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });

      return NextResponse.json({ logs });
    } catch (error) {
      log.error("audit log API error", { error: error instanceof Error ? error.message : String(error) });
      return jsonServerError("שגיאת שרת פנימית.");
    }
  },
  { allowedRoles: ["ORG_ADMIN", "SUPER_ADMIN"] },
);

export const DELETE = withWorkspacesAuth(
  async (_req, { orgId, userId }) => {
    try {
      const deleted = await prisma.activityLog.deleteMany({
        where: { organizationId: orgId },
      });

      await prisma.activityLog.create({
        data: {
          organizationId: orgId,
          userId,
          action: "AUDIT_LOG_CLEARED",
          details: `נוקו ${deleted.count} רשומות מיומן הפעולות.`,
        },
      });

      return NextResponse.json({ ok: true, deleted: deleted.count });
    } catch (error) {
      log.error("audit log clear API error", { error: error instanceof Error ? error.message : String(error) });
      return jsonServerError("שגיאת שרת פנימית.");
    }
  },
  { allowedRoles: ["ORG_ADMIN", "SUPER_ADMIN"] },
);
