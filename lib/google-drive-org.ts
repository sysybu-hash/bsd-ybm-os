import { CloudProvider } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { DEFAULT_GOOGLE_DRIVE_FOLDER_NAME } from "@/lib/google-drive-config";
import { GoogleDriveService } from "@/lib/services/google-drive";

export type GoogleDriveOrgSettings = {
  id: string;
  driveFolderId: string | null;
  driveFolderName: string;
  driveSyncEnabled: boolean;
  lastSyncAt: Date | null;
  syncCursor: string | null;
};

export async function getOrCreateGoogleDriveIntegration(organizationId: string) {
  return prisma.cloudIntegration.upsert({
    where: {
      organizationId_provider: {
        organizationId,
        provider: CloudProvider.GOOGLE_DRIVE,
      },
    },
    create: {
      organizationId,
      provider: CloudProvider.GOOGLE_DRIVE,
      displayName: "Google Drive",
      driveFolderName: DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
      driveSyncEnabled: true,
    },
    update: {},
  });
}

export function integrationToSettings(row: {
  id: string;
  driveFolderId: string | null;
  driveFolderName: string | null;
  driveSyncEnabled: boolean;
  lastSyncAt: Date | null;
  driveSyncCursor: string | null;
}): GoogleDriveOrgSettings {
  return {
    id: row.id,
    driveFolderId: row.driveFolderId,
    driveFolderName: row.driveFolderName?.trim() || DEFAULT_GOOGLE_DRIVE_FOLDER_NAME,
    driveSyncEnabled: row.driveSyncEnabled,
    lastSyncAt: row.lastSyncAt,
    syncCursor: row.driveSyncCursor,
  };
}

/** מוצא או יוצר את תיקיית העבודה ב-Drive ושומר ב-CloudIntegration */
export async function ensureOrgDriveWorkspaceFolder(
  userId: string,
  organizationId: string,
  folderName?: string,
): Promise<{ folderId: string; folderName: string }> {
  const integration = await getOrCreateGoogleDriveIntegration(organizationId);
  const name = (folderName ?? integration.driveFolderName ?? DEFAULT_GOOGLE_DRIVE_FOLDER_NAME).trim();

  if (integration.driveFolderId) {
    return { folderId: integration.driveFolderId, folderName: name };
  }

  const drive = await GoogleDriveService.forUser(userId);
  const folder = await drive.ensureFolder(name, "root");
  const folderId = folder.id;
  if (!folderId) {
    throw new Error("לא ניתן ליצור תיקיית Drive");
  }

  await prisma.cloudIntegration.update({
    where: { id: integration.id },
    data: {
      driveFolderId: folderId,
      driveFolderName: name,
    },
  });

  return { folderId, folderName: name };
}
