import { createLogger } from "@/lib/logger";
import { getMeckanoAttendanceForProject, isMeckanoEnabledForOrganization } from "@/lib/meckano-access";
import { syncMeckanoToWorkDiaries } from "@/lib/meckano-work-diary-sync";
import { prisma } from "@/lib/prisma";

const log = createLogger("meckano-scheduled-sync");

export type MeckanoScheduledSyncResult = {
  organizationsProcessed: number;
  projectsSynced: number;
  rowsImported: number;
  created: number;
  updated: number;
};

/** סנכרון יומי: נוכחות ממקאנו → יומני עבודה לפרויקטים עם meckanoZoneId */
export async function runMeckanoScheduledSyncForAllOrganizations(): Promise<MeckanoScheduledSyncResult> {
  const orgs = await prisma.organization.findMany({
    where: { meckanoAutoSyncEnabled: true },
    select: { id: true },
  });

  let organizationsProcessed = 0;
  let projectsSynced = 0;
  let rowsImported = 0;
  let created = 0;
  let updated = 0;

  for (const org of orgs) {
    const enabled = await isMeckanoEnabledForOrganization(org.id);
    if (!enabled) continue;

    const systemUser = await prisma.user.findFirst({
      where: { organizationId: org.id },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!systemUser) continue;

    const projects = await prisma.project.findMany({
      where: { organizationId: org.id, meckanoZoneId: { not: null } },
      select: { id: true },
    });

    let orgHadSync = false;
    for (const project of projects) {
      try {
        const rows = await getMeckanoAttendanceForProject(project.id, org.id);
        if (rows.length === 0) continue;
        const result = await syncMeckanoToWorkDiaries(project.id, org.id, systemUser.id, rows);
        projectsSynced += 1;
        rowsImported += rows.length;
        created += result.created;
        updated += result.updated;
        orgHadSync = true;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn("project sync failed", { organizationId: org.id, projectId: project.id, error: msg });
      }
    }

    if (orgHadSync) {
      await prisma.organization.update({
        where: { id: org.id },
        data: { meckanoLastSyncAt: new Date() },
      });
      organizationsProcessed += 1;
    }
  }

  return { organizationsProcessed, projectsSynced, rowsImported, created, updated };
}
