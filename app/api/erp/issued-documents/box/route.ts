import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { DocStatus, DocType } from "@prisma/client";

/**
 * GET /api/erp/issued-documents/box
 * Query params: contactId OR projectId
 * Returns all issued documents linked to that contact/project within the org.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.organizationId;
  if (!orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const contactId = searchParams.get("contactId");
  const projectId = searchParams.get("projectId");

  if (!contactId && !projectId) {
    return NextResponse.json({ error: "contactId or projectId required" }, { status: 400 });
  }

  /* If projectId is given, resolve all contactIds in that project */
  let contactIds: string[] | undefined;
  if (projectId) {
    const contacts = await prisma.contact.findMany({
      where: { organizationId: orgId, projectId },
      select: { id: true },
    });
    contactIds = contacts.map((c) => c.id);
    if (contactIds.length === 0) return NextResponse.json({ documents: [] });
  }

  const docs = await prisma.issuedDocument.findMany({
    where: {
      organizationId: orgId,
      ...(contactId ? { contactId } : { contactId: { in: contactIds } }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      type: true,
      number: true,
      date: true,
      clientName: true,
      status: true,
      amount: true,
      vat: true,
      total: true,
      items: true,
    },
  });

  /* Map to IssuedDocRow shape */
  const rows = docs.map((d) => ({
    id: d.id,
    docType: d.type as DocType,
    number: d.number,
    dateLabel: new Date(d.date).toLocaleDateString("he-IL"),
    dateIso: d.date.toISOString(),
    clientName: d.clientName,
    status: d.status as DocStatus,
    total: d.total,
    amount: d.amount,
    vat: d.vat,
    items: d.items,
  }));

  return NextResponse.json({ documents: rows });
}
