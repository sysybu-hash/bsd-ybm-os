import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "@/lib/services/google-drive";

export async function ensureProjectDriveFolder(
  projectId: string,
  organizationId: string,
  userId: string,
): Promise<{ driveFolderId: string; driveFolderName: string } | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, organizationId },
    select: { id: true, name: true, driveFolderId: true, driveFolderName: true },
  });
  if (!project) return null;
  if (project.driveFolderId) {
    return {
      driveFolderId: project.driveFolderId,
      driveFolderName: project.driveFolderName ?? project.name,
    };
  }

  const integration = await prisma.cloudIntegration.findFirst({
    where: { organizationId },
    select: { driveFolderId: true },
  });
  const orgParent = integration?.driveFolderId ?? "root";

  const drive = await GoogleDriveService.forUser(userId);
  const folderName = `פרויקט — ${project.name}`.slice(0, 120);
  const folder = await drive.ensureFolder(folderName, orgParent);
  if (!folder?.id) return null;

  await prisma.project.update({
    where: { id: projectId },
    data: { driveFolderId: folder.id, driveFolderName: folderName },
  });

  return { driveFolderId: folder.id, driveFolderName: folderName };
}
