/**
 * שמירת מסמך סרוק ב-Google Drive של המשתמש — שלב 0 באפיון הסריקה.
 *
 * בניגוד לפענוח, הקובץ המקורי לא נשמר כרגע בשום מקום — רק ה-JSON שחולץ.
 * פונקציה זו שומרת את הקובץ המקורי תחת תיקיית "סריקות / {שנה-חודש}" ב-Drive,
 * ומחזירה את ה-ID והקישור הישיר לצפייה.
 *
 * תלויות: GoogleDriveService (lib/services/google-drive.ts) שכבר מחובר ב-Field Copilot.
 */
import { GoogleDriveService, GoogleOAuthNotLinkedError } from "@/lib/services/google-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-archive-to-drive");

/** שם תיקיית הסריקות ב-Root של Drive */
const SCANS_ROOT_FOLDER = "סריקות BSD-YBM";

/** תת-תיקייה חודשית: YYYY-MM */
function buildMonthFolderName(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export type ScanArchiveResult =
  | {
      ok: true;
      driveFileId: string;
      driveWebViewLink: string | null;
      driveFolderId: string;
    }
  | {
      ok: false;
      reason:
        | "drive_not_linked"   // משתמש לא חיבר Google Drive
        | "drive_unavailable"  // שגיאת API / תיקייה לא נוצרה
        | "upload_failed";     // העלאה נכשלה
    };

/**
 * שומר את הקובץ הסרוק ב-Drive של המשתמש.
 * לא-חוסם: אם Drive לא מחובר / נכשל — מחזיר { ok: false } בלי לזרוק שגיאה.
 *
 * @param userId  - ה-user שעליו הסריקה (צריך OAuth מחובר)
 * @param file    - הקובץ המקורי (File / Blob)
 * @param date    - תאריך הסריקה (לתיקיית החודש); ברירת מחדל: עכשיו
 */
export async function archiveScanToDrive(
  userId: string,
  file: File | { name: string; type: string; arrayBuffer: () => Promise<ArrayBuffer> },
  date: Date = new Date(),
): Promise<ScanArchiveResult> {
  let drive: GoogleDriveService;
  try {
    drive = await GoogleDriveService.forUser(userId);
  } catch (err) {
    if (err instanceof GoogleOAuthNotLinkedError) {
      return { ok: false, reason: "drive_not_linked" };
    }
    log.warn("drive init failed", { userId, error: err instanceof Error ? err.message : String(err) });
    return { ok: false, reason: "drive_unavailable" };
  }

  try {
    // תיקיית שורש + תת-תיקייה חודשית
    const root = await drive.ensureFolder(SCANS_ROOT_FOLDER, "root");
    if (!root?.id) return { ok: false, reason: "drive_unavailable" };

    const monthFolder = await drive.ensureFolder(buildMonthFolderName(date), root.id);
    if (!monthFolder?.id) return { ok: false, reason: "drive_unavailable" };

    // העלאת הקובץ
    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || "application/octet-stream";
    const uploaded = await drive.uploadFile(file.name, mimeType, buffer, monthFolder.id);

    if (!uploaded.id) return { ok: false, reason: "upload_failed" };

    log.info("scan archived to drive", {
      userId,
      fileName: file.name,
      driveFileId: uploaded.id,
      folder: monthFolder.id,
    });

    return {
      ok: true,
      driveFileId: uploaded.id,
      driveWebViewLink: uploaded.webViewLink ?? null,
      driveFolderId: monthFolder.id,
    };
  } catch (err: unknown) {
    log.warn("scan archive upload failed", {
      userId,
      fileName: file.name,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: "upload_failed" };
  }
}
