import { prisma } from "@/lib/prisma";
import { ensureOrgDriveWorkspaceFolder } from "@/lib/google-drive-org";
import { GoogleDriveService, type DriveFileMeta } from "@/lib/services/google-drive";

export type DriveSyncResult = {
  ok: boolean;
  added: number;
  updated: number;
  removed: number;
  folderId: string;
  folderName: string;
  lastSyncAt: string;
};

function isUnderWorkspace(
  file: DriveFileMeta,
  workspaceId: string,
  parentMap: Map<string, string | null>,
): boolean {
  if (file.id === workspaceId) return true;
  let current: string | null | undefined = file.parents?.[0] ?? parentMap.get(file.id ?? "") ?? null;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current === workspaceId) return true;
    current = parentMap.get(current) ?? null;
  }
  return false;
}

/** סנכרון מלא + עדכון מטא-דאטה מ-Drive ל-DB */
export async function syncGoogleDriveWorkspace(
  userId: string,
  organizationId: string,
): Promise<DriveSyncResult> {
  const { folderId, folderName } = await ensureOrgDriveWorkspaceFolder(userId, organizationId);
  const integration = await prisma.cloudIntegration.findFirst({
    where: { organizationId, provider: "GOOGLE_DRIVE" },
  });
  if (!integration?.driveSyncEnabled) {
    return {
      ok: true,
      added: 0,
      updated: 0,
      removed: 0,
      folderId,
      folderName,
      lastSyncAt: new Date().toISOString(),
    };
  }

  const drive = await GoogleDriveService.forUser(userId);
  const allFiles = await drive.listAllInTree(folderId);
  const parentMap = new Map<string, string | null>();
  for (const f of allFiles) {
    if (f.id) parentMap.set(f.id, f.parents?.[0] ?? null);
  }

  const inWorkspace = allFiles.filter((f) => f.id && isUnderWorkspace(f, folderId, parentMap));
  const liveIds = new Set(inWorkspace.map((f) => f.id!).filter(Boolean));

  let added = 0;
  let updated = 0;

  for (const file of inWorkspace) {
    if (!file.id) continue;
    const modifiedTime = file.modifiedTime ? new Date(file.modifiedTime) : null;
    const existing = await prisma.driveSyncEntry.findUnique({
      where: {
        organizationId_driveFileId: {
          organizationId,
          driveFileId: file.id,
        },
      },
    });
    const data = {
      name: file.name ?? "ללא שם",
      mimeType: file.mimeType ?? "application/octet-stream",
      md5Checksum: file.md5Checksum ?? null,
      modifiedTime,
      webViewLink: file.webViewLink ?? null,
      parentDriveId: file.parents?.[0] ?? null,
      trashed: false,
    };
    if (!existing) {
      await prisma.driveSyncEntry.create({
        data: { organizationId, driveFileId: file.id, ...data },
      });
      added += 1;
    } else {
      await prisma.driveSyncEntry.update({
        where: { id: existing.id },
        data,
      });
      updated += 1;
    }
  }

  const removed = await prisma.driveSyncEntry.updateMany({
    where: {
      organizationId,
      trashed: false,
      driveFileId: { notIn: [...liveIds] },
    },
    data: { trashed: true },
  });

  const now = new Date();
  await prisma.cloudIntegration.update({
    where: { id: integration.id },
    data: { lastSyncAt: now },
  });

  return {
    ok: true,
    added,
    updated,
    removed: removed.count,
    folderId,
    folderName,
    lastSyncAt: now.toISOString(),
  };
}
