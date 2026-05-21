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

  const zoneNames = zones.map((z) => z.name);

  // --- N+1 fix: batch-load all existing projects and contacts in TWO queries ---
  const [existingProjects, existingContacts] = await Promise.all([
    prisma.project.findMany({
      where: { organizationId: orgId, name: { in: zoneNames } },
      select: { id: true, name: true },
    }),
    prisma.contact.findMany({
      where: { organizationId: orgId, name: { in: zoneNames } },
      select: { id: true, name: true, projectId: true },
    }),
  ]);

  const projectByName = new Map(existingProjects.map((p) => [p.name, p]));
  const contactByName = new Map(existingContacts.map((c) => [c.name, c]));

  let syncedProjects = 0;
  let syncedContacts = 0;

  // Process zones — create missing projects first (sequential to get IDs for contacts)
  const projectIdByZoneName = new Map<string, string>();

  for (const zone of zones) {
    const existing = projectByName.get(zone.name);
    if (existing) {
      projectIdByZoneName.set(zone.name, existing.id);
    } else {
      const created = await prisma.project.create({
        data: { organizationId: orgId, name: zone.name, isActive: true },
        select: { id: true },
      });
      projectIdByZoneName.set(zone.name, created.id);
      syncedProjects++;
    }
  }

  // Batch contact updates and creates
  const contactUpdates: Array<{ id: string; projectId: string }> = [];
  const contactCreates: Array<{ organizationId: string; name: string; status: "ACTIVE"; projectId: string }> = [];

  for (const zone of zones) {
    const projectId = projectIdByZoneName.get(zone.name)!;
    const existing = contactByName.get(zone.name);
    if (existing) {
      if (existing.projectId !== projectId) {
        contactUpdates.push({ id: existing.id, projectId });
      }
    } else {
      contactCreates.push({ organizationId: orgId, name: zone.name, status: "ACTIVE", projectId });
      syncedContacts++;
    }
  }

  // Run contact mutations + zone sync-flag updates in a single transaction
  await prisma.$transaction([
    ...contactUpdates.map(({ id, projectId }) =>
      prisma.contact.update({ where: { id }, data: { projectId, status: "ACTIVE" } }),
    ),
    contactCreates.length > 0
      ? prisma.contact.createMany({ data: contactCreates, skipDuplicates: true })
      : prisma.$queryRaw`SELECT 1`,
    prisma.meckanoZone.updateMany({
      where: { id: { in: zones.map((z) => z.id) } },
      data: { syncedToCrm: true },
    }),
  ]);

  const total = zones.length;
  return NextResponse.json({
    synced: total,
    syncedProjects,
    syncedContacts,
    message: `סונכרנו ${total} אתרים — ${syncedProjects} פרויקטים חדשים ו-${syncedContacts} לקוחות חדשים נוצרו, הקיימים קושרו`,
  });
});
