import type { DriveDecodeStatus } from "@prisma/client";
import type { DriveSaveTarget } from "@/lib/google-drive-decode-routing";

export type DriveDecodePreviewItem = {
  driveFileId: string;
  fileName: string;
  mimeType: string;
  decodeStatus: DriveDecodeStatus;
  detectedDocType: string;
  detectedClientName: string;
  targetModule: DriveSaveTarget;
  needsReview: boolean;
  reviewReason?: string;
  aiData?: Record<string, unknown>;
  documentId?: string;
  error?: string;
};
