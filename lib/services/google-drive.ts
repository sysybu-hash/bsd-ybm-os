import { google } from "googleapis";
import {
  getGoogleOAuth2ClientForUser,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/google-oauth-client";

export { GoogleOAuthNotLinkedError, GoogleOAuthRefreshError };

export type DriveFileMeta = {
  id?: string | null;
  name?: string | null;
  mimeType?: string | null;
  webViewLink?: string | null;
  iconLink?: string | null;
  modifiedTime?: string | null;
  md5Checksum?: string | null;
  parents?: string[] | null;
};

function escapeDriveQueryValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export class GoogleDriveService {
  private auth;

  constructor(auth: InstanceType<typeof google.auth.OAuth2>) {
    this.auth = auth;
  }

  static async forUser(userId: string) {
    const auth = await getGoogleOAuth2ClientForUser(userId);
    return new GoogleDriveService(auth);
  }

  private drive() {
    return google.drive({ version: "v3", auth: this.auth });
  }

  async listFiles(folderId: string = "root") {
    const drive = this.drive();
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, webViewLink, iconLink, modifiedTime, md5Checksum, parents)",
      pageSize: 200,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
      orderBy: "folder,name",
    });

    return (response.data.files ?? []) as DriveFileMeta[];
  }

  async findFolderByName(parentId: string, name: string): Promise<DriveFileMeta | null> {
    const drive = this.drive();
    const safeName = escapeDriveQueryValue(name);
    const response = await drive.files.list({
      q: `'${parentId}' in parents and name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, name, mimeType, parents)",
      pageSize: 5,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    return (response.data.files?.[0] as DriveFileMeta | undefined) ?? null;
  }

  async ensureFolder(name: string, parentId: string = "root") {
    const existing = await this.findFolderByName(parentId, name);
    if (existing?.id) return existing;
    return this.createFolder(name, parentId);
  }

  /** רשימת כל הקבצים בעץ תחת תיקייה (BFS) */
  async listAllInTree(rootFolderId: string): Promise<DriveFileMeta[]> {
    const drive = this.drive();
    const out: DriveFileMeta[] = [];
    const queue: string[] = [rootFolderId];
    const folderMime = "application/vnd.google-apps.folder";

    while (queue.length > 0) {
      const parentId = queue.shift()!;
      let pageToken: string | undefined;
      do {
        const response = await drive.files.list({
          q: `'${parentId}' in parents and trashed = false`,
          fields:
            "nextPageToken, files(id, name, mimeType, webViewLink, iconLink, modifiedTime, md5Checksum, parents)",
          pageSize: 200,
          pageToken,
          supportsAllDrives: true,
          includeItemsFromAllDrives: true,
        });
        const batch = (response.data.files ?? []) as DriveFileMeta[];
        for (const file of batch) {
          out.push(file);
          if (file.mimeType === folderMime && file.id) {
            queue.push(file.id);
          }
        }
        pageToken = response.data.nextPageToken ?? undefined;
      } while (pageToken);
    }

    return out;
  }

  async uploadFile(
    name: string,
    mimeType: string,
    content: Buffer | string,
    folderId?: string,
  ) {
    const drive = this.drive();

    const fileMetadata = {
      name,
      parents: folderId ? [folderId] : undefined,
    };

    const media = {
      mimeType,
      body: typeof content === "string" ? content : Buffer.from(content),
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, mimeType, modifiedTime, md5Checksum, parents",
      supportsAllDrives: true,
    });

    return response.data as DriveFileMeta;
  }

  async downloadFileContent(
    fileId: string,
    fileName: string,
    mimeType: string,
  ): Promise<{ buffer: Buffer; mimeType: string; name: string }> {
    const drive = this.drive();

    if (mimeType.startsWith("application/vnd.google-apps.")) {
      const exportMime =
        mimeType === "application/vnd.google-apps.document"
          ? "text/plain"
          : mimeType === "application/vnd.google-apps.spreadsheet"
            ? "text/csv"
            : mimeType === "application/vnd.google-apps.presentation"
              ? "application/pdf"
              : "application/pdf";
      const exportName =
        exportMime === "text/plain" || exportMime === "text/csv"
          ? fileName.replace(/\.[^.]+$/, "") + (exportMime === "text/csv" ? ".csv" : ".txt")
          : fileName.replace(/\.[^.]+$/, "") + ".pdf";

      const res = await drive.files.export(
        { fileId, mimeType: exportMime },
        { responseType: "arraybuffer" },
      );
      const buffer = Buffer.from(res.data as ArrayBuffer);
      return { buffer, mimeType: exportMime, name: exportName };
    }

    const res = await drive.files.get(
      { fileId, alt: "media", supportsAllDrives: true },
      { responseType: "arraybuffer" },
    );
    const buffer = Buffer.from(res.data as ArrayBuffer);
    return { buffer, mimeType, name: fileName };
  }

  async createFolder(name: string, parentId?: string) {
    const drive = this.drive();

    const fileMetadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id, name, parents",
      supportsAllDrives: true,
    });

    return response.data as DriveFileMeta;
  }
}
