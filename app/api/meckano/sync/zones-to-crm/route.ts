import { NextResponse } from "next/server";
import { withWorkspacesAuth } from "@/lib/api-handler";
import { jsonForbidden } from "@/lib/api-json";
import { getAuthorizedMeckanoOrganizationId, MECKANO_ACCESS_ERROR } from "@/lib/meckano-access";
import { meckanoSessionFromWorkspace } from "@/lib/meckano-route-auth";
import { prisma } from "@/lib/prisma";

/** סנכרון MeckanoZones פעילים לפרויקטי ERP + אנשי קשר ב-CRM */
export const POST = withWorkspacesAuth(async (_req, ctx) => {
  const sessionLike = await meckanoSessionFromWorkspace(ctx);
  const orgId = await getAuthorizedMeckanoOrganizationId(sessionLike);
  if (!orgId) {
    return jsonForbidden(MECKANO_ACCESS_ERROR);
  }

  const zones = await prisma.meckanoZone.findMany({
    where: { organizationId: orgId, isActive: true },
  });

  if (zones.length === 0) {
    return NextResponse.json({ synced: 0, message: "אין אזורים פעילים לסנכרון" });
  }

  let syncedProjects = 0;
  let syncedContacts = 0;

  for (const zone of zones) {
    let project = await prisma.project.findFirst({
      where: { organizationId: orgId, name: zone.name },
    });
    if (!project) {
      project = await prisma.project.create({
        data: { organizationId: orgId, name: zone.name, isActive: true },
      });
      syncedProjects++;
    }

    const existingContact = await prisma.contact.findFirst({
      where: { organizationId: orgId, name: zone.name },
    });
    if (existingContact) {
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
});
