import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";

const createContactSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
});

/**
 * GET /api/crm/contacts
 * מחזיר רשימת לקוחות CRM עם נתוני ERP מסונכרנים:
 * — כל החשבוניות המשויכות, סך חיוב, סך שולם, סך פתוח
 */
export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";

  const contacts = await prisma.contact.findMany({
    where: {
      organizationId: orgId,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
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

  /* חישוב סיכום ERP לכל לקוח */
  const rows = contacts.map((c) => {
    const totalBilled = c.issuedDocuments.reduce((s, d) => s + d.total, 0);
    const totalPaid = c.issuedDocuments
      .filter((d) => d.status === "PAID")
      .reduce((s, d) => s + d.total, 0);
    const totalPending = totalBilled - totalPaid;
    return {
      ...c,
      createdAt: c.createdAt.toISOString(),
      erp: { totalBilled, totalPaid, totalPending, invoiceCount: c.issuedDocuments.length },
    };
  });

  return NextResponse.json({ contacts: rows });
});

export const POST = withWorkspacesAuth(
  async (_req, { orgId }, body) => {
    try {
      const contact = await prisma.contact.create({
        data: {
          name: body.name,
          email: body.email ?? null,
          phone: body.phone ?? null,
          notes: body.notes ?? null,
          status: (body.status ?? "LEAD").toUpperCase(),
          organizationId: orgId,
        },
      });
      return NextResponse.json({ success: true, contact });
    } catch (err) {
      return apiErrorResponse(err, "CRM contact create");
    }
  },
  { schema: createContactSchema },
);
