import { prisma } from "@/lib/prisma";
import { jsonNotFound } from "@/lib/api-json";

export async function getProjectForOrg(projectId: string, orgId: string) {
  return prisma.project.findFirst({
    where: { id: projectId, organizationId: orgId },
  });
}

export async function requireProjectForOrg(projectId: string, orgId: string) {
  const project = await getProjectForOrg(projectId, orgId);
  if (!project) {
    return { ok: false as const, response: jsonNotFound("הפרויקט לא נמצא") };
  }
  return { ok: true as const, project };
}
