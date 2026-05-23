import type { DriveDecodeStatus } from "@prisma/client";
import type { WidgetType } from "@/hooks/use-window-manager";

export interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  webViewLink: string;
  iconLink: string;
  modifiedTime?: string | null;
  decodeStatus?: DriveDecodeStatus | null;
  decodeError?: string | null;
  detectedClientName?: string | null;
  detectedDocType?: string | null;
}

export type WorkspaceInfo = {
  folderId: string;
  folderName: string;
};

export type GoogleDriveWidgetProps = {
  liveData?: Record<string, unknown> | null;
  openWorkspaceWidget?: (type: WidgetType, data?: Record<string, unknown> | null) => void;
};
