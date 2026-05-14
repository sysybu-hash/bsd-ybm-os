"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getCrmDataAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const orgId = session.user.organizationId;

    const [contacts, projects] = await Promise.all([
      prisma.contact.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
      }),
      prisma.project.findMany({
        where: { organizationId: orgId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          isActive: true,
          activeFrom: true,
          activeTo: true,
          createdAt: true,
        },
      })
    ]);

    return {
      success: true,
      contacts: contacts.map(c => ({
        ...c,
        createdAt: c.createdAt.toISOString(),
        issuedDocuments: [], // Would need sub-fetch if needed
        erp: { totalBilled: 0, totalPaid: 0, totalPending: 0, invoiceCount: 0 }
      })),
      projects: projects.map(p => ({
        ...p,
        createdAt: p.createdAt.toISOString()
      }))
    };
  } catch (error) {
    console.error("CRM data error:", error);
    return { success: false, error: "Failed to load CRM data" };
  }
}
