/**
 * ניקוי אוטומטי של job-data ישן — שלב 9א באפיון.
 *
 * DocumentScanJob.fileData מכיל base64 של הקובץ המקורי.
 * עבור jobs שהושלמו לפני יותר מ-CLEANUP_AFTER_DAYS ימים — מוחקים את fileData
 * (אם הקובץ כבר אוחסן ב-Drive, שמור בDrive; אחרת זה פשוט חיסכון).
 *
 * מופעל מה-cron היומי הקיים (analyze-queue/process).
 */
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("scan-job-cleanup");

/** ימים לשמור fileData אחרי השלמה */
const CLEANUP_AFTER_DAYS = 7;
/** מקסימום jobs לנקות בריצה אחת */
const MAX_PER_RUN = 500;

const CLEARED_MARKER = '{"_cleared":true}';

export async function cleanupOldScanJobFileData(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CLEANUP_AFTER_DAYS);

  try {
    const result = await prisma.documentScanJob.updateMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        updatedAt: { lt: cutoff },
        // Only clean if not already cleared
        NOT: { fileData: CLEARED_MARKER },
      },
      data: { fileData: CLEARED_MARKER },
    });

    if (result.count > 0) {
      log.info("scan job cleanup done", { cleared: result.count });
    }
    return result.count;
  } catch (err: unknown) {
    log.warn("scan job cleanup failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return 0;
  }
}
