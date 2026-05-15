import { google } from "googleapis";
import {
  getGoogleOAuth2ClientForUser,
  GoogleOAuthNotLinkedError,
  GoogleOAuthRefreshError,
} from "@/lib/google-oauth-client";

export { GoogleOAuthNotLinkedError, GoogleOAuthRefreshError };

export class GoogleDriveService {
  private auth;

  constructor(auth: InstanceType<typeof google.auth.OAuth2>) {
    this.auth = auth;
  }

  static async forUser(userId: string) {
    const auth = await getGoogleOAuth2ClientForUser(userId);
    return new GoogleDriveService(auth);
  }

  async listFiles(folderId: string = "root") {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, webViewLink, iconLink)",
      pageSize: 100,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return response.data.files || [];
  }

  async uploadFile(
    name: string,
    mimeType: string,
    content: Buffer | string,
    folderId?: string,
  ) {
    const drive = google.drive({ version: "v3", auth: this.auth });

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
      fields: "id, name, webViewLink",
    });

    return response.data;
  }

  async createFolder(name: string, parentId?: string) {
    const drive = google.drive({ version: "v3", auth: this.auth });

    const fileMetadata = {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: parentId ? [parentId] : undefined,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      fields: "id, name",
    });

    return response.data;
  }
}
