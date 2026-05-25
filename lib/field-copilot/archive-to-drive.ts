import { ensureProjectDriveFolder } from "@/lib/projects/ensure-project-drive-folder";
import { createLogger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "@/lib/services/google-drive";

const log = createLogger("field-copilot/archive-to-drive");

const COPILOT_ROOT_FOLDER = "קופיילוט שטח";

/** תיקייה לפי זמן יצירת הנכס — Asia/Jerusalem ברירת מחדל */
export function buildCaptureFolderName(date: Date, timeZone = "Asia/Jerusalem"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "00";

  const y = pick("year");
  const m = pick("month");
  const d = pick("day");
  const h = pick("hour");
  const min = pick("minute");
  const s = pick("second");
  return `${y}-${m}-${d}_${h}-${min}-${s}`;
}

function extensionForMime(mimeType: string, kind: string): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("mp4")) return "mp4";
  if (kind === "video") return "webm";
  return "jpg";
}

export type ArchiveFieldCopilotInput = {
  userId: string;
  organizationId: string;
  session: { id: string; projectId: string | null };
  asset: { id: string; kind: string; mimeType: string; createdAt: Date };
  buffer: Buffer;
};

export type ArchiveFieldCopilotResult =
  | { ok: true; driveFileId: string; driveWebViewLink: string | null; driveFolderId: string }
  | { ok: false; reason: "no_project" | "drive_unavailable" | "upload_failed" };

export async function archiveFieldCopilotAsset(
  input: ArchiveFieldCopilotInput,
): Promise<ArchiveFieldCopilotResult> {
  const { userId, organizationId, session, asset, buffer } = input;
  if (!session.projectId) {
    return { ok: false, reason: "no_project" };
  }

  try {
    const projectFolder = await ensureProjectDriveFolder(session.projectId, organizationId, userId);
    if (!projectFolder?.driveFolderId) {
      return { ok: false, reason: "drive_unavailable" };
    }

    const drive = await GoogleDriveService.forUser(userId);
    const copilotFolder = await drive.ensureFolder(COPILOT_ROOT_FOLDER, projectFolder.driveFolderId);
    if (!copilotFolder?.id) {
      return { ok: false, reason: "drive_unavailable" };
    }

    const timestampFolder = await drive.ensureFolder(
      buildCaptureFolderName(asset.createdAt),
      copilotFolder.id,
    );
    if (!timestampFolder?.id) {
      return { ok: false, reason: "drive_unavailable" };
    }

    const ext = extensionForMime(asset.mimeType, asset.kind);
    const fileName = `${asset.kind}-${asset.id.slice(0, 8)}.${ext}`;
    const uploaded = await drive.uploadFile(
      fileName,
      asset.mimeType,
      buffer,
      timestampFolder.id,
    );
    if (!uploaded.id) {
      return { ok: false, reason: "upload_failed" };
    }

    await prisma.driveSyncEntry.upsert({
      where: {
        organizationId_driveFileId: {
          organizationId,
          driveFileId: uploaded.id,
        },
      },
      create: {
        organizationId,
        driveFileId: uploaded.id,
        name: uploaded.name ?? fileName,
        mimeType: uploaded.mimeType ?? asset.mimeType,
        webViewLink: uploaded.webViewLink ?? null,
        modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
        parentDriveId: uploaded.parents?.[0] ?? timestampFolder.id,
        trashed: false,
      },
      update: {
        name: uploaded.name ?? fileName,
        mimeType: uploaded.mimeType ?? asset.mimeType,
        webViewLink: uploaded.webViewLink ?? null,
        modifiedTime: uploaded.modifiedTime ? new Date(uploaded.modifiedTime) : new Date(),
        trashed: false,
      },
    });

    const drivePatch = {
      driveFileId: uploaded.id,
      driveWebViewLink: uploaded.webViewLink ?? null,
      driveFolderId: timestampFolder.id,
      driveArchiveStatus: "synced",
      driveError: null,
    } as Prisma.FieldCopilotAssetUpdateInput;

    await prisma.fieldCopilotAsset.update({
      where: { id: asset.id },
      data: drivePatch,
    });

    return {
      ok: true,
      driveFileId: uploaded.id,
      driveWebViewLink: uploaded.webViewLink ?? null,
      driveFolderId: timestampFolder.id,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn("archive failed", { assetId: asset.id, error: message });
    await prisma.fieldCopilotAsset
      .update({
        where: { id: asset.id },
        data: {
          driveArchiveStatus: "failed",
          driveError: message.slice(0, 500),
        } as Prisma.FieldCopilotAssetUpdateInput,
      })
      .catch(() => undefined);
    return { ok: false, reason: "upload_failed" };
  }
}
