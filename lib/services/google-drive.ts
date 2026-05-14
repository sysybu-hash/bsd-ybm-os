import { google } from "googleapis";
import { prisma } from "@/lib/prisma";

export class GoogleDriveService {
  private auth;

  constructor(accessToken?: string, refreshToken?: string) {
    this.auth = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXTAUTH_URL
    );

    if (accessToken || refreshToken) {
      this.auth.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    }
  }

  /**
   * יוצר מופע של השירות עבור משתמש ספציפי על בסיס הטוקנים השמורים ב-DB
   */
  static async forUser(userId: string) {
    const account = await prisma.account.findFirst({
      where: {
        userId,
        provider: "google",
      },
    });

    if (!account) {
      throw new Error("Google account not linked for user");
    }

    return new GoogleDriveService(
      account.access_token ?? undefined,
      account.refresh_token ?? undefined
    );
  }

  /**
   * רשימת קבצים בתיקייה (או בשורש)
   */
  async listFiles(folderId: string = "root") {
    const drive = google.drive({ version: "v3", auth: this.auth });
    const response = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id, name, mimeType, webViewLink, iconLink)",
    });

    return response.data.files || [];
  }

  /**
   * העלאת קובץ לתיקייה ספציפית
   */
  async uploadFile(name: string, mimeType: string, content: Buffer | string, folderId?: string) {
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

  /**
   * יצירת תיקייה חדשה
   */
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
