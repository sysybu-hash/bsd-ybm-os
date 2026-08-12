/** שם תיקיית ברירת המחדל ב-Google Drive לארגון */
export const DEFAULT_GOOGLE_DRIVE_FOLDER_NAME = "BSD-YBM";

/** תואם ל-OAuth consent screen — גישה לקבצים/תיקיות שיצרה או פתחה האפליקציה (תיקיית BSD-YBM) */
export const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/**
 * People API — קריאת אנשי קשר לייבוא CRM.
 * משתמשים קיימים חייבים «חיבור מחדש ל-Google» (prompt=consent) כדי לאשר scope חדש.
 */
export const GOOGLE_CONTACTS_READONLY_SCOPE =
  "https://www.googleapis.com/auth/contacts.readonly";

/** scopes לזרימת reconnect — Drive, Contacts (People API) */
export const GOOGLE_DRIVE_SCOPES = [
  "openid",
  "email",
  "profile",
  GOOGLE_DRIVE_FILE_SCOPE,
  GOOGLE_CONTACTS_READONLY_SCOPE,
].join(" ");
