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

    // Filter valid contacts first
    type ContactInput = {
      name?: string;
      email?: string;
      phone?: string;
      company?: string;
      notes?: string;
      taxId?: string;
    };
    const valid = (contacts as ContactInput[]).filter((c) => c.name);
    if (valid.length === 0) {
      return NextResponse.json({ success: true, importedCount: 0, skippedCount: contacts.length, message: "אין לקוחות לייבא" });
    }

    // --- N+1 fix: batch-load all existing contacts by emails + phones in ONE query ---
    const emails = valid.map((c) => c.email).filter(Boolean) as string[];
    const phones = valid.map((c) => c.phone).filter(Boolean) as string[];

    const existingContacts = await prisma.contact.findMany({
      where: {
        organizationId: orgId,
        OR: [
          emails.length > 0 ? { email: { in: emails } } : undefined,
          phones.length > 0 ? { phone: { in: phones } } : undefined,
        ].filter(Boolean) as Array<{ email: { in: string[] } } | { phone: { in: string[] } }>,
      },
      select: { email: true, phone: true },
    });

    const existingEmails = new Set(existingContacts.map((c) => c.email).filter(Boolean) as string[]);
    const existingPhones = new Set(existingContacts.map((c) => c.phone).filter(Boolean) as string[]);

    const toCreate = valid.filter((c) => {
      if (c.email && existingEmails.has(c.email)) return false;
      if (c.phone && existingPhones.has(c.phone)) return false;
      return true;
    });

    const skippedCount = contacts.length - toCreate.length;

    if (toCreate.length === 0) {
      return NextResponse.json({
        success: true,
        importedCount: 0,
        skippedCount,
        message: `0 לקוחות יובאו, ${skippedCount} נדחו עקב כפילות או חוסר בנתונים`,
      });
    }

    // --- Batch create all new contacts in ONE query ---
    await prisma.contact.createMany({
      data: toCreate.map((c) => ({
        name: c.name!,
        email: c.email ?? null,
        phone: c.phone ?? null,
        notes:
          `${c.company ? `חברה: ${c.company}. ` : ""}${c.taxId ? `ח"פ: ${c.taxId}. ` : ""}${c.notes ?? ""}`.trim() || null,
        organizationId: orgId,
        status: "LEAD" as const,
      })),
      skipDuplicates: true,
    });

    const importedCount = toCreate.length;

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
