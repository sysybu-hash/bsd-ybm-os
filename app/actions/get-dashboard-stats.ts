"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getDashboardStatsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const orgId = session.user.organizationId;

    const [clientsCount, revenueData, documentsCount] = await Promise.all([
      prisma.contact.count({ where: { organizationId: orgId } }),
      prisma.issuedDocument.aggregate({
        where: { organizationId: orgId, type: "INVOICE" },
        _sum: { total: true }
      }),
      prisma.document.count({ where: { organizationId: orgId } })
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
    console.error("Dashboard stats error:", error);
    return { success: false, error: "Failed to load stats" };
  }
}
