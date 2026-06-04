import type { KnowledgeVaultPath, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { decodeDriveFilePreview } from "@/lib/google-drive-decode-service";
import { syncGoogleDriveWorkspace } from "@/lib/google-drive-sync";
import { inferMimeFromFileName, isSupportedScanMime } from "@/lib/scan-mime";
import { MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";
import {
  ensureKnowledgeVaultFolders,
  vaultFolderIdForPath,
} from "@/lib/knowledge-vault/folders";
import { indexKnowledgeVaultEntry } from "@/lib/knowledge-vault/chunk-index";

export type VaultListFilters = {
  vaultPath?: KnowledgeVaultPath;
  search?: string;
  limit?: number;
};

function buildParsedSummary(preview: {
  detectedDocType?: string;
  detectedClientName?: string;
  aiData?: Record<string, unknown>;
  error?: string;
}): Prisma.InputJsonValue {
  const ai = preview.aiData ?? {};
  const text =
    typeof ai.rawText === "string"
      ? ai.rawText.slice(0, 8000)
      : typeof ai.summary === "string"
        ? ai.summary.slice(0, 8000)
        : "";
  return {
    detectedDocType: preview.detectedDocType ?? "",
    detectedClientName: preview.detectedClientName ?? "",
    textPreview: text,
    parsedAt: new Date().toISOString(),
    error: preview.error ?? null,
  };
}

async function upsertDriveEntry(
  organizationId: string,
  meta: {
    driveFileId: string;
    name: string;
    mimeType: string;
    parentDriveId: string;
    webViewLink?: string | null;
    modifiedTime?: Date;
  },
  vault: {
    vaultPath: KnowledgeVaultPath;
    sourceWidgetId?: string | null;
    issuedByWidget?: string | null;
    parsedSummary?: Prisma.InputJsonValue;
  },
) {
  return prisma.driveSyncEntry.upsert({
    where: {
      organizationId_driveFileId: {
        organizationId,
        driveFileId: meta.driveFileId,
      },
    },
    create: {
      organizationId,
      driveFileId: meta.driveFileId,
      name: meta.name,
      mimeType: meta.mimeType,
      parentDriveId: meta.parentDriveId,
      webViewLink: meta.webViewLink ?? null,
      modifiedTime: meta.modifiedTime ?? new Date(),
      trashed: false,
      vaultPath: vault.vaultPath,
      sourceWidgetId: vault.sourceWidgetId ?? null,
      issuedByWidget: vault.issuedByWidget ?? null,
      parsedSummary: vault.parsedSummary,
    },
    update: {
      name: meta.name,
      mimeType: meta.mimeType,
      parentDriveId: meta.parentDriveId,
      webViewLink: meta.webViewLink ?? null,
      modifiedTime: meta.modifiedTime ?? new Date(),
      trashed: false,
      vaultPath: vault.vaultPath,
      sourceWidgetId: vault.sourceWidgetId ?? undefined,
      issuedByWidget: vault.issuedByWidget ?? undefined,
      parsedSummary: vault.parsedSummary ?? undefined,
    },
  });
}

export async function ingestFromUpload(
  userId: string,
  organizationId: string,
  file: File,
  options?: { sourceWidgetId?: string; autoParse?: boolean },
) {
  const folders = await ensureKnowledgeVaultFolders(userId, organizationId);
  const targetFolderId = vaultFolderIdForPath(folders, "INGEST");

  const buffer = Buffer.from(await file.arrayBuffer());
  if (buffer.length > MAX_SCAN_FILE_BYTES) {
    throw new Error("קובץ גדול מדי (מקסימום 25MB)");
  }

  const scanMime = inferMimeFromFileName(file.name, file.type || "");
  if (!isSupportedScanMime(scanMime)) {
    throw new Error(`סוג קובץ לא נתמך: ${scanMime}`);
  }

  const drive = await GoogleDriveService.forUser(userId);
  const uploaded = await drive.uploadFile(file.name, scanMime, buffer, targetFolderId);
  if (!uploaded.id) throw new Error("העלאה ל-Drive נכשלה");

  const entry = await upsertDriveEntry(
    organizationId,
    {
      driveFileId: uploaded.id,
      name: uploaded.name ?? file.name,
      mimeType: uploaded.mimeType ?? scanMime,
      parentDriveId: targetFolderId,
      webViewLink: uploaded.webViewLink,
      modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
    },
    {
      vaultPath: "INGEST",
      sourceWidgetId: options?.sourceWidgetId ?? null,
    },
  );

  void syncGoogleDriveWorkspace(userId, organizationId).catch(() => undefined);

  if (options?.autoParse !== false) {
    await parseAsset(userId, organizationId, uploaded.id);
  }

  return { entry, driveFileId: uploaded.id, webViewLink: uploaded.webViewLink };
}

export async function ingestFromDriveFile(
  userId: string,
  organizationId: string,
  driveFileId: string,
  options?: { sourceWidgetId?: string; vaultPath?: KnowledgeVaultPath },
) {
  const existing = await prisma.driveSyncEntry.findUnique({
    where: {
      organizationId_driveFileId: { organizationId, driveFileId },
    },
  });

  const entry = await prisma.driveSyncEntry.update({
    where: {
      organizationId_driveFileId: { organizationId, driveFileId },
    },
    data: {
      vaultPath: options?.vaultPath ?? existing?.vaultPath ?? "INGEST",
      sourceWidgetId: options?.sourceWidgetId ?? existing?.sourceWidgetId,
    },
  });

  return entry;
}

export async function parseAsset(userId: string, organizationId: string, driveFileId: string) {
  const row = await prisma.driveSyncEntry.findUnique({
    where: { organizationId_driveFileId: { organizationId, driveFileId } },
  });
  if (!row) throw new Error("קובץ לא נמצא במאגר");

  const preview = await decodeDriveFilePreview(
    userId,
    organizationId,
    driveFileId,
    row.name,
    row.mimeType,
  );

  const summary = buildParsedSummary(preview);

  const updated = await prisma.driveSyncEntry.update({
    where: { organizationId_driveFileId: { organizationId, driveFileId } },
    data: {
      parsedSummary: summary,
      vaultPath: row.vaultPath ?? "INGEST",
      detectedClientName: preview.detectedClientName || row.detectedClientName,
      detectedDocType: preview.detectedDocType || row.detectedDocType,
    },
  });

  void indexKnowledgeVaultEntry(organizationId, updated.id, summary, updated.name).catch(
    () => undefined,
  );

  return updated;
}

export async function issueAsset(
  userId: string,
  organizationId: string,
  params: {
    fileName: string;
    mimeType: string;
    content: Buffer;
    issuedByWidget?: string;
    parsedSummary?: Prisma.InputJsonValue;
  },
) {
  const folders = await ensureKnowledgeVaultFolders(userId, organizationId);
  const targetFolderId = vaultFolderIdForPath(folders, "ISSUED");
  const drive = await GoogleDriveService.forUser(userId);
  const uploaded = await drive.uploadFile(
    params.fileName,
    params.mimeType,
    params.content,
    targetFolderId,
  );
  if (!uploaded.id) throw new Error("הנפקה ל-Drive נכשלה");

  const entry = await upsertDriveEntry(
    organizationId,
    {
      driveFileId: uploaded.id,
      name: uploaded.name ?? params.fileName,
      mimeType: uploaded.mimeType ?? params.mimeType,
      parentDriveId: targetFolderId,
      webViewLink: uploaded.webViewLink,
      modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
    },
    {
      vaultPath: "ISSUED",
      issuedByWidget: params.issuedByWidget ?? null,
      parsedSummary: params.parsedSummary,
    },
  );

  void syncGoogleDriveWorkspace(userId, organizationId).catch(() => undefined);
  return { entry, driveFileId: uploaded.id };
}

export async function listForOrg(organizationId: string, filters: VaultListFilters = {}) {
  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 500);
  const where: Prisma.DriveSyncEntryWhereInput = {
    organizationId,
    trashed: false,
    vaultPath: filters.vaultPath ?? { not: null },
  };
  if (filters.search?.trim()) {
    where.name = { contains: filters.search.trim(), mode: "insensitive" };
  }

  return prisma.driveSyncEntry.findMany({
    where,
    orderBy: { modifiedTime: "desc" },
    take: limit,
    select: {
      id: true,
      driveFileId: true,
      name: true,
      mimeType: true,
      vaultPath: true,
      decodeStatus: true,
      decodeError: true,
      parsedSummary: true,
      webViewLink: true,
      modifiedTime: true,
      sourceWidgetId: true,
      issuedByWidget: true,
      detectedClientName: true,
      detectedDocType: true,
    },
  });
}
