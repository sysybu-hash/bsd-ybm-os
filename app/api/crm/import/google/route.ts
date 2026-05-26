import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { apiErrorResponse } from "@/lib/api-route-helpers";
import { fetchGoogleContactsForUser } from "@/lib/google-contacts-fetch";
import { buildGoogleContactsConnectUrl } from "@/lib/google-contacts-oauth";
import { prisma } from "@/lib/prisma";
import { applyRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

export const POST = withWorkspacesAuth(async (req, { orgId, userId }) => {
  const limited = await applyRateLimit(req as NextRequest, "crm:import-google", 5, 60_000);
  if (limited) return limited;

  try {
    let contacts: Awaited<ReturnType<typeof fetchGoogleContactsForUser>>;
    try {
      contacts = await fetchGoogleContactsForUser(userId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "GOOGLE_CONTACTS_NOT_CONNECTED") {
        return NextResponse.json(
          {
            error: "Google Contacts לא מחובר",
            connectUrl: buildGoogleContactsConnectUrl("/?w=crmTable"),
          },
          { status: 403 },
        );
      }
      throw err;
    }

    if (contacts.length === 0) {
      return NextResponse.json({
        success: true,
        importedCount: 0,
        skippedCount: 0,
        message: "לא נמצאו אנשי קשר ב-Google",
      });
    }

    const emails = contacts.map((c) => c.email).filter(Boolean) as string[];
    const phones = contacts.map((c) => c.phone).filter(Boolean) as string[];

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

    const toCreate = contacts.filter((c) => {
      if (c.email && existingEmails.has(c.email)) return false;
      if (c.phone && existingPhones.has(c.phone)) return false;
      return true;
    });

    const skippedCount = contacts.length - toCreate.length;

    if (toCreate.length > 0) {
      await prisma.contact.createMany({
        data: toCreate.map((c) => ({
          name: c.name,
          email: c.email ?? null,
          phone: c.phone ?? null,
          notes:
            `${c.company ? `חברה: ${c.company}. ` : ""}${c.notes ?? ""}`.trim() || null,
          organizationId: orgId,
          status: "LEAD",
          tags: ["google-contacts"],
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({
      success: true,
      importedCount: toCreate.length,
      skippedCount,
      message: `${toCreate.length} אנשי קשר יובאו מ-Google, ${skippedCount} דולגו (כפילות)`,
    });
  } catch (err: unknown) {
    return apiErrorResponse(err, "api/crm/import/google");
  }
});
