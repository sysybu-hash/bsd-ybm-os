import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { createNumberedDocument } from "@/lib/finance-numbering";
import { calculateDocumentTotalsFromOrg } from "@/lib/billing-calculations";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";
import { v4 as uuidv4 } from "uuid";


export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const body = await req.json();
  const { contactId, amount, items, clientName } = body;

  if (!contactId || !amount || !clientName) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const token = uuidv4();
    
    // 1. Create the Quote in the DB
    const quote = await prisma.quote.create({
      data: {
        token,
        amount: parseFloat(amount),
        contactId,
        organizationId: orgId,
        status: "PENDING",
      }
    });

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { companyType: true, isReportable: true, vatRatePercent: true },
    });
    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 400 });
    }

    const net = parseFloat(amount);
    const totals = calculateDocumentTotalsFromOrg(net, org, { docType: "QUOTE" });

    const issuedDoc = await createNumberedDocument({
      organizationId: orgId,
      type: "QUOTE",
      clientName,
      amount: net,
      vat: totals.vat,
      total: totals.total,
      items,
      contactId,
    });

    const siteBase = getCanonicalSiteUrl().replace(/\/$/, "");

    return NextResponse.json({
      success: true,
      quoteId: quote.id,
      token: quote.token,
      documentNumber: issuedDoc.number,
      signUrl: `${siteBase}/sign/${token}`,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Failed to generate quote";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
});

export const GET = withWorkspacesAuth(async (req, { orgId }) => {
  const quotes = await prisma.quote.findMany({
    where: { organizationId: orgId },
    include: { contact: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ quotes });
});
