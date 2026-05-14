import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonBadRequest, jsonNotFound } from "@/lib/api-json";
import { createOrganizationNotification } from "@/lib/notifications-service";

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  
  const quote = await prisma.quote.findUnique({
    where: { token: id },
    include: { contact: true },
  });

  if (!quote) {
    return jsonNotFound("הצעה לא נמצאה");
  }

  return NextResponse.json({
    id: quote.id,
    amount: quote.amount,
    clientName: quote.contact.name,
    status: quote.status,
    createdAt: quote.createdAt
  });
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const body = await req.json();
  const signatureBase64 = body.signatureBase64 as string | undefined;

  if (!signatureBase64 || typeof signatureBase64 !== "string") {
    return jsonBadRequest("חסרה חתימה", "missing_signature");
  }

  const quote = await prisma.quote.findUnique({
    where: { token: id },
    include: { contact: true },
  });

  if (!quote) {
    return jsonNotFound("הצעה לא נמצאה");
  }

  if (quote.status === "CLOSED_WON") {
    return NextResponse.json({ ok: true, message: "כבר אושר" });
  }

  // Find an admin user to own the document
  const adminUser = await prisma.user.findFirst({
    where: {
      organizationId: quote.organizationId,
      role: { in: ['ORG_ADMIN', 'SUPER_ADMIN'] }
    }
  });

  if (!adminUser) {
    // Fallback to any user in the org if no admin found
    const fallbackUser = await prisma.user.findFirst({
      where: { organizationId: quote.organizationId }
    });
    if (!fallbackUser) {
      return jsonBadRequest("לא נמצא משתמש לשיוך המסמך", "no_user_found");
    }
    // Use fallbackUser.id
  }

  const ownerId = adminUser?.id || (await prisma.user.findFirst({ where: { organizationId: quote.organizationId } }))?.id;

  if (!ownerId) {
    return jsonBadRequest("לא נמצא משתמש לשיוך המסמך", "no_user_found");
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { token: id },
      data: {
        signatureBase64,
        status: "CLOSED_WON",
      },
    }),
    prisma.contact.update({
      where: { id: quote.contactId },
      data: { status: "CLOSED_WON" },
    }),
    // Auto-Archive: Create a Document record for the signed quote
    prisma.document.create({
      data: {
        fileName: `הצעת_מחיר_חתומה_${quote.contact.name}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.pdf`,
        type: 'SIGNED_QUOTE',
        organizationId: quote.organizationId,
        userId: ownerId,
        aiData: {
          amount: quote.amount,
          clientName: quote.contact.name,
          signedAt: new Date().toISOString(),
          status: 'SIGNED'
        }
      }
    })
  ]);

  // Create In-App Notification
  await createOrganizationNotification(
    quote.organizationId,
    "מסמך נחתם בהצלחה",
    `הצעת מחיר עבור ${quote.contact.name} על סך ₪${quote.amount.toLocaleString()} נחתמה דיגיטלית.`
  );

  return NextResponse.json({ ok: true });
}
