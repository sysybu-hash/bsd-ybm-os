import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { createNumberedDocument } from "@/lib/finance-numbering";
import { createPayPlusPaymentPage, isPayPlusConfigured } from "@/lib/payplus";
import { v4 as uuidv4 } from "uuid";

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const body = await req.json();
  const { contactId, amount, items, clientName, clientEmail } = body;

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

    // 2. Create the IssuedDocument (Sequential numbering)
    // We added QUOTE to DocType enum
    const issuedDoc = await createNumberedDocument({
      organizationId: orgId,
      type: "QUOTE",
      clientName,
      amount: parseFloat(amount),
      vat: parseFloat(amount) * 0.17, // Assuming 17% VAT
      total: parseFloat(amount) * 1.17,
      items,
      contactId,
    });

    // 3. Generate PayPlus link if configured
    let paymentLink = null;
    if (isPayPlusConfigured() && clientEmail) {
      try {
        paymentLink = await createPayPlusPaymentPage({
          amount: parseFloat(amount) * 1.17,
          itemName: `הצעת מחיר #${issuedDoc.number} - ${clientName}`,
          customerName: clientName,
          customerEmail: clientEmail,
          successUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/sign/success`,
          errorUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/sign/error`,
          callbackUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/payplus`,
          metadata: { organizationId: orgId, quoteId: quote.id }
        });
      } catch (payplusError) {
        console.error("PayPlus link generation failed:", payplusError);
      }
    }

    return NextResponse.json({
      success: true,
      quoteId: quote.id,
      token: quote.token,
      documentNumber: issuedDoc.number,
      paymentLink,
      signUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/sign/${token}`
    });
  } catch (error: any) {
    console.error("Quote generation failed:", error);
    return NextResponse.json({ error: error.message || "Failed to generate quote" }, { status: 500 });
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
