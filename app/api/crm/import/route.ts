import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { prisma } from "@/lib/prisma";

export const POST = withWorkspacesAuth(async (request, { orgId }) => {
  try {
    const { contacts } = await request.json();

    if (!Array.isArray(contacts)) {
      return NextResponse.json({ error: "Invalid data format" }, { status: 400 });
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const contactData of contacts) {
      const { name, email, phone, company, notes, taxId } = contactData;

      if (!name) {
        skippedCount++;
        continue;
      }

      const existing = await prisma.contact.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            email ? { email } : null,
            phone ? { phone } : null,
            taxId ? { notes: { contains: taxId } } : null,
          ].filter(Boolean) as Array<{ email: string } | { phone: string } | { notes: { contains: string } }>,
        },
      });

      if (existing) {
        skippedCount++;
        continue;
      }

      await prisma.contact.create({
        data: {
          name,
          email: email || null,
          phone: phone || null,
          notes: `${company ? `חברה: ${company}. ` : ""}${taxId ? `ח"פ: ${taxId}. ` : ""}${notes || ""}` || null,
          organizationId: orgId,
          status: "LEAD",
        },
      });
      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedCount,
      skippedCount,
      message: `${importedCount} לקוחות יובאו בהצלחה, ${skippedCount} נדחו עקב כפילות או חוסר בנתונים`,
    });
  } catch (error: unknown) {
    return apiErrorResponse(error, "CRM Import Error");
  }
});
