/** שם תיקיית ברירת המחדל ב-Google Drive לארגון */
export const DEFAULT_GOOGLE_DRIVE_FOLDER_NAME = "BSD-YBM";

/** תואם ל-OAuth consent screen — גישה לקבצים/תיקיות שיצרה או פתחה האפליקציה (תיקיית BSD-YBM) */
export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** scopes לזרימת reconnect ל-Drive (אחרי התחברות) */
export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_DRIVE_FILE_SCOPE,
].join(" ");
