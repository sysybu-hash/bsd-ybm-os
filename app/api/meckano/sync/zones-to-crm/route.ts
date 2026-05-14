import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { jsonForbidden, jsonUnauthorized } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { prisma } from "@/lib/prisma";

// POST /api/meckano/sync/zones-to-crm
// Syncs active MeckanoZones as ERP Projects + CRM Contacts, and links Contact → Project.
// Handles existing manually-created Projects/Contacts with matching names.
export async function POST(_req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.organizationId) return jsonUnauthorized();

  const orgId = await getAuthorizedMeckanoOrganizationId(session);
  if (!orgId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const zones = await prisma.meckanoZone.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  if (zones.length === 0)
    return NextResponse.json({ synced: 0, message: "אין אזורים פעילים לסנכרון" });

  let syncedProjects = 0;
  let syncedContacts = 0;

  for (const zone of zones) {
    // 1. Find or create ERP Project with zone name
    let project = await prisma.project.findFirst({
      where: { organizationId: orgId, name: zone.name },
    });
    if (!project) {
      project = await prisma.project.create({
        data: { organizationId: orgId, name: zone.name, isActive: true },
      });
      syncedProjects++;
    }

    // 2. Find or create CRM Contact with zone name, always link to project
    const existingContact = await prisma.contact.findFirst({
      where: { organizationId: orgId, name: zone.name },
    });
    if (existingContact) {
      // Link to project if not already linked
      if (existingContact.projectId !== project.id) {
        await prisma.contact.update({
          where: { id: existingContact.id },
          data: { projectId: project.id, status: "ACTIVE" },
        });
      }
    } else {
      await prisma.contact.create({
        data: {
          organizationId: orgId,
          name: zone.name,
          status: "ACTIVE",
          projectId: project.id,
        },
      });
      syncedContacts++;
    }

    // 3. Mark zone as synced
    await prisma.meckanoZone.update({
      where: { id: zone.id },
      data: { syncedToCrm: true },
    });
  }

  const total = zones.length;
  return NextResponse.json({
    synced: total,
    syncedProjects,
    syncedContacts,
    message: `סונכרנו ${total} אתרים — ${syncedProjects} פרויקטים חדשים ו-${syncedContacts} לקוחות חדשים נוצרו, הקיימים קושרו`,
  });
}
