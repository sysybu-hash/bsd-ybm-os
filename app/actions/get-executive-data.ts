"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getExecutiveDataAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const orgId = session.user.organizationId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [revenueSum, pendingExpenses, newLeads, totalDocs] = await Promise.all([
      prisma.issuedDocument.aggregate({
        where: { organizationId: orgId, type: "INVOICE" },
        _sum: { total: true }
      }),
      prisma.document.count({
        where: { organizationId: orgId, status: "PENDING" },
      }),
      prisma.contact.count({
        where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo } }
      }),
      prisma.issuedDocument.count({ where: { organizationId: orgId } })
    ]);

    // Simple healthy score based on some factors
    const healthScore = totalDocs > 0 ? Math.min(100, 80 + (newLeads * 2)) : 0;

    return {
      success: true,
      stats: {
        predictedCashflow: `₪${(revenueSum._sum.total || 0).toLocaleString()}`,
        openExpenses: `₪0`, // Placeholder until we have expense totals
        leadsCount: newLeads.toString(),
        healthScore: `${healthScore}/100`
      }
    };
  } catch (error) {
    console.error("Executive data error:", error);
    return { success: false, error: "Failed to load executive data" };
  }
}
