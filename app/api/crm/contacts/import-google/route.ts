import { NextResponse } from "next/server";
import { z } from "zod";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { googleDriveErrorResponse } from "@/lib/google-drive-api-errors";
import { prisma } from "@/lib/prisma";
import { GoogleContactsService } from "@/lib/services/google-contacts";

const CRM_IMPORT_ROLES = ["ORG_ADMIN", "SUPER_ADMIN", "PROJECT_MGR"] as const;
const RECONNECT_CALLBACK = "/m/dashboard/crm";

const importBodySchema = z.object({
  importAll: z.boolean().optional(),
  ids: z.array(z.string().min(1)).max(200).optional(),
});

function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = email?.trim().toLowerCase();
  return trimmed || null;
}

async function loadExistingEmails(orgId: string): Promise<Set<string>> {
  const rows = await prisma.contact.findMany({
    where: { organizationId: orgId, email: { not: null } },
    select: { email: true },
  });
  return new Set(
    rows.map((r) => normalizeEmail(r.email)).filter((e): e is string => Boolean(e)),
  );
}

function annotateExisting(
  contacts: Awaited<ReturnType<GoogleContactsService["listConnections"]>>,
  existingEmails: Set<string>,
) {
  return contacts.map((c) => {
    const emailKey = normalizeEmail(c.email);
    return {
      ...c,
      alreadyExists: emailKey ? existingEmails.has(emailKey) : false,
    };
  });
}

export const GET = withWorkspacesAuth(
  async (_req, { orgId, userId }) => {
    try {
      const service = await GoogleContactsService.forUser(userId);
      const [contacts, existingEmails] = await Promise.all([
        service.listConnections(),
        loadExistingEmails(orgId),
      ]);
      const rows = annotateExisting(contacts, existingEmails);
      return NextResponse.json({
        contacts: rows,
        total: rows.length,
      });
    } catch (error) {
      return googleDriveErrorResponse(error, RECONNECT_CALLBACK);
    }
  },
  { allowedRoles: [...CRM_IMPORT_ROLES] },
);

export const POST = withWorkspacesAuth(
  async (_req, { orgId, userId }, body) => {
    try {
      const service = await GoogleContactsService.forUser(userId);
      const [contacts, existingEmails] = await Promise.all([
        service.listConnections(),
        loadExistingEmails(orgId),
      ]);

      const idSet =
        body.importAll || !body.ids?.length ? null : new Set(body.ids);
      const selected = idSet
        ? contacts.filter((c) => idSet.has(c.id))
        : contacts;

      const seenEmails = new Set(existingEmails);
      const toCreate: Array<{ name: string; email: string | null; phone: string | null }> =
        [];

      for (const c of selected) {
        if (!c.name.trim()) continue;
        const emailKey = normalizeEmail(c.email);
        if (emailKey) {
          if (seenEmails.has(emailKey)) continue;
          seenEmails.add(emailKey);
        }
        toCreate.push({
          name: c.name.trim(),
          email: c.email?.trim() || null,
          phone: c.phone?.trim() || null,
        });
      }

      const skippedCount = selected.length - toCreate.length;

      if (toCreate.length === 0) {
        return NextResponse.json({
          success: true,
          importedCount: 0,
          skippedCount,
          message: `0 contacts imported, ${skippedCount} skipped (duplicate or missing data)`,
        });
      }

      await prisma.contact.createMany({
        data: toCreate.map((c) => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          organizationId: orgId,
          status: "LEAD",
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({
        success: true,
        importedCount: toCreate.length,
        skippedCount,
        message: `${toCreate.length} contacts imported, ${skippedCount} skipped`,
      });
    } catch (error) {
      return googleDriveErrorResponse(error, RECONNECT_CALLBACK);
    }
  },
  { allowedRoles: [...CRM_IMPORT_ROLES], schema: importBodySchema },
);
