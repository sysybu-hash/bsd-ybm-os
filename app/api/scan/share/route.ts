/**
 * PWA Web Share Target handler — שלב 1 באפיון הסריקה.
 * רשום ב-/public/manifest.json → share_target.action.
 *
 * כאשר משתמש מ-Android/iOS משתף קובץ (תמונה / PDF) לאפליקציה,
 * הדפדפן שולח POST multipart/form-data לכאן.
 *
 * מה שקורה עכשיו:
 *   1. קוראים את הקובץ מהform.
 *   2. שומרים אותו ל-Drive תחת "סריקות BSD-YBM/shared-temp/" (אם Drive מחובר).
 *   3. מפנים למסך הסורק עם `sharedDriveId` כ-query param.
 *      הלקוח בוחר את הקובץ מ-Drive ופותח סריקה אוטומטית.
 *   4. אם Drive לא מחובר / נכשל — מפנים עם `share=1` (כמו קודם).
 */
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { archiveScanToDrive } from "@/lib/scan-archive-to-drive";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-share");

export const dynamic = "force-dynamic";

const FALLBACK_REDIRECT = "/?w=documentsHub&tab=scan&source=share";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const userId = session?.user?.id;

    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      redirect(FALLBACK_REDIRECT);
    }

    // Web Share Target sends file under the key defined in manifest.json → "file"
    const file = formData.get("file");
    if (!file || !(file instanceof File) || file.size === 0) {
      redirect(FALLBACK_REDIRECT);
    }

    // ── If user is logged in and Drive is available, persist the file ──────
    if (userId) {
      try {
        const archiveResult = await archiveScanToDrive(userId, file, new Date());
        if (archiveResult.ok) {
          log.info("share target: file archived", {
            userId,
            fileName: file.name,
            driveFileId: archiveResult.driveFileId,
          });
          // Redirect with Drive file ID so the scanner can auto-load it
          redirect(
            `/?w=documentsHub&tab=scan&source=share&sharedDriveId=${encodeURIComponent(archiveResult.driveFileId)}&sharedFileName=${encodeURIComponent(file.name)}`,
          );
        }
      } catch (err: unknown) {
        log.warn("share target: drive archive failed, falling back", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Fallback: redirect to scanner without file (user picks manually)
    redirect(FALLBACK_REDIRECT);
  } catch (err: unknown) {
    // next/navigation redirects throw a special error — re-throw it
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("NEXT_REDIRECT")) throw err;
    log.error("share target error", { error: msg });
    redirect(FALLBACK_REDIRECT);
  }
}
