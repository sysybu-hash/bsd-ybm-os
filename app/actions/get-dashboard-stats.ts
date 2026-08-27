"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";
const log = createLogger("get-dashboard-stats");

export async function getDashboardStatsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const orgId = session.user.organizationId;

    // The document count used to be fetched here and then dropped on the floor —
    // a full count() on every dashboard load that nothing ever read.
    const [clientsCount, revenueData] = await Promise.all([
      prisma.contact.count({ where: { organizationId: orgId } }),
      prisma.issuedDocument.aggregate({
        where: { organizationId: orgId, type: "INVOICE" },
        _sum: { total: true }
      }),
    ]);

    return {
      success: true,
      stats: {
        clients: clientsCount.toString(),
        revenue: `₪${(revenueData._sum.total || 0).toLocaleString()}`,
        expenses: `₪0`, // This would come from an expense tracking module if separate
        intelligence: "Active"
      }
    };
  } catch (error) {
    log.error("Dashboard stats error:", error);
    return { success: false, error: "Failed to load stats" };
  }
}
