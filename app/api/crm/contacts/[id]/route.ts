import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonNotFound, jsonUnauthorized } from "@/lib/api-json";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/crm/contacts/[id]
 * מחזיר לקוח CRM יחיד עם כל נתוני ERP המשויכים אליו
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!orgId) return jsonUnauthorized();

  const { id } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id, organizationId: orgId },    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      status: true,
      value: true,
      notes: true,
      createdAt: true,
      project: { select: { id: true, name: true } },
      issuedDocuments: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          number: true,
          clientName: true,
          amount: true,
          vat: true,
          total: true,
          status: true,
          date: true,
          dueDate: true,
          items: true,
          createdAt: true,
        },
      },
    },
  });

  if (!contact) return jsonNotFound("לא נמצא");

  const totalBilled = contact.issuedDocuments.reduce((s, d) => s + d.total, 0);
  const totalPaid = contact.issuedDocuments
    .filter((d) => d.status === "PAID")
    .reduce((s, d) => s + d.total, 0);

  return NextResponse.json({
    contact: {
      ...contact,
      createdAt: contact.createdAt.toISOString(),
      erp: {
        totalBilled,
        totalPaid,
        totalPending: totalBilled - totalPaid,
        invoiceCount: contact.issuedDocuments.length,
      },
    },
  });
}
