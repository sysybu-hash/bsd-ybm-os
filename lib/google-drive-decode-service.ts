import { DriveDecodeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { GoogleDriveService } from "@/lib/services/google-drive";
import { saveScannedDocumentAction } from "@/app/actions/save-scanned-document";
import {
  extractClientNameFromAi,
  routeDriveDecode,
} from "@/lib/google-drive-decode-routing";
import type { DriveDecodePreviewItem } from "@/lib/google-drive-decode-types";
import { unifiedExtractFromFile } from "@/lib/scan/unified-extract";
import { isScanUnifiedV2Enabled } from "@/lib/scan/feature-flag";
import { processDocumentAction } from "@/app/actions/process-document";
import { inferScreenTypeFromFileForIndustry } from "@/lib/ai/screen-decode-policy";

export type { DriveDecodePreviewItem } from "@/lib/google-drive-decode-types";
import { inferMimeFromFileName, isSupportedScanMime } from "@/lib/scan-mime";
import { MAX_SCAN_FILE_BYTES } from "@/lib/scan-mime";

async function setDecodeStatus(
  organizationId: string,
  driveFileId: string,
  patch: {
    decodeStatus: DriveDecodeStatus;
    decodeError?: string | null;
    linkedDocumentId?: string | null;
    lastDecodedAt?: Date | null;
    detectedClientName?: string | null;
    detectedDocType?: string | null;
  },
) {
  await prisma.driveSyncEntry.updateMany({
    where: { organizationId, driveFileId },
    data: patch,
  });
}

export async function decodeDriveFilePreview(
  userId: string,
  organizationId: string,
  driveFileId: string,
  fileName: string,
  mimeType: string,
): Promise<DriveDecodePreviewItem> {
  const base: DriveDecodePreviewItem = {
    driveFileId,
    fileName,
    mimeType,
    decodeStatus: "PROCESSING",
    detectedDocType: "",
    detectedClientName: "",
    targetModule: "REVIEW",
    needsReview: true,
  };

  if (mimeType === "application/vnd.google-apps.folder") {
    await setDecodeStatus(organizationId, driveFileId, {
      decodeStatus: "FAILED",
      decodeError: "לא ניתן לפענח תיקייה",
    });
    return { ...base, decodeStatus: "FAILED", error: "לא ניתן לפענח תיקייה" };
  }

  await setDecodeStatus(organizationId, driveFileId, { decodeStatus: "PROCESSING" });

  try {
    const drive = await GoogleDriveService.forUser(userId);
    const { buffer, mimeType: resolvedMime, name } = await drive.downloadFileContent(
      driveFileId,
      fileName,
      mimeType,
    );

    if (buffer.length > MAX_SCAN_FILE_BYTES) {
      throw new Error("קובץ גדול מדי לפענוח (מקסימום 25MB)");
    }

    const scanMime = inferMimeFromFileName(name, resolvedMime);
    if (!isSupportedScanMime(scanMime)) {
      throw new Error(`סוג קובץ לא נתמך: ${scanMime}`);
    }

    const blob = new Blob([new Uint8Array(buffer)], { type: scanMime });
    const file = new File([blob], name, { type: scanMime });

    let aiData: Record<string, unknown>;

    if (isScanUnifiedV2Enabled()) {
      const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { industry: true },
      });
      const screenType = inferScreenTypeFromFileForIndustry(
        name,
        scanMime,
        org?.industry ?? "CONSTRUCTION",
      );
      const scanMode =
        screenType === "blueprint"
          ? "DRAWING_BOQ"
          : screenType === "invoice"
            ? "INVOICE_FINANCIAL"
            : "GENERAL_DOCUMENT";

      const extracted = await unifiedExtractFromFile({
        file,
        userId,
        scanMode,
        engineRunMode: "AUTO",
        industry: org?.industry ?? "CONSTRUCTION",
      });
      aiData = extracted.aiData;
    } else {
      const form = new FormData();
      form.append("file", file);
      form.append("provider", "gemini");

      const processed = await processDocumentAction(form, userId, organizationId, false);
      if (!processed.success) {
        throw new Error(processed.error ?? "פענוח נכשל");
      }

      aiData =
        processed.data && typeof processed.data === "object" && !Array.isArray(processed.data)
          ? (processed.data as Record<string, unknown>)
          : {};
    }

    const routing = routeDriveDecode(aiData);
    const detectedClientName = extractClientNameFromAi(aiData);
    const detectedDocType = String(aiData.docType ?? routing.analysisType ?? "UNKNOWN");

    const needsReview =
      routing.needsReview || (!detectedClientName && routing.targetModule !== "SKIP");

    const decodeStatus: DriveDecodeStatus = needsReview ? "NEEDS_REVIEW" : "PENDING";

    await setDecodeStatus(organizationId, driveFileId, {
      decodeStatus,
      decodeError: null,
      detectedClientName: detectedClientName || null,
      detectedDocType,
      lastDecodedAt: new Date(),
    });

    return {
      ...base,
      decodeStatus,
      detectedDocType,
      detectedClientName,
      targetModule: routing.targetModule,
      needsReview,
      reviewReason: routing.reason,
      aiData,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "פענוח נכשל";
    await setDecodeStatus(organizationId, driveFileId, {
      decodeStatus: "FAILED",
      decodeError: message,
    });
    return { ...base, decodeStatus: "FAILED", error: message };
  }
}

export async function saveDecodedDriveFile(
  fileName: string,
  aiData: Record<string, unknown>,
  targetModule: "ERP" | "CRM",
  contactId?: string,
): Promise<{ ok: boolean; documentId?: string; error?: string }> {
  const result = await saveScannedDocumentAction(
    fileName,
    aiData,
    targetModule,
    contactId,
  );
  if (!result.success) {
    return { ok: false, error: result.error ?? "שמירה נכשלה" };
  }
  return { ok: true, documentId: result.documentId };
}

export async function finalizeDriveFileSave(
  organizationId: string,
  driveFileId: string,
  documentId: string | undefined,
) {
  await setDecodeStatus(organizationId, driveFileId, {
    decodeStatus: "COMPLETED",
    linkedDocumentId: documentId ?? null,
    lastDecodedAt: new Date(),
    decodeError: null,
  });
}
