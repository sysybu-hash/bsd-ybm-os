"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function getIssuedDocumentsAction() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) {
    return { success: false, error: "Unauthorized" };
  }

  try {
    const documents = await prisma.issuedDocument.findMany({
      where: {
        organizationId: session.user.organizationId,
      },
      orderBy: {
        date: "desc",
      },
      take: 50,
    });

    return {
      success: true,
      documents: documents.map((doc) => ({
        id: doc.id,
        displayId: `INV-${doc.number}`,
        client: doc.clientName,
        date: doc.date.toLocaleDateString("he-IL"),
        dateIso: doc.date.toISOString(),
        dueDateIso: doc.dueDate ? doc.dueDate.toISOString() : null,
        statusKey: doc.status,
        status: doc.status === "PAID" ? "הוקצה" : "בתהליך",
        amount: `₪${doc.total.toLocaleString()}`,
        total: doc.total,
        vat: doc.vat,
        allocation: (doc as { allocationNumber?: string }).allocationNumber ?? "-",
        type: doc.type === "INVOICE" ? "חשבונית מס" : doc.type === "RECEIPT" ? "קבלה" : "מסמך",
        docType: doc.type,
      })),
    };
  } catch (error) {
    console.error("Error fetching issued documents:", error);
    return { success: false, error: "Failed to fetch documents" };
  }
}
