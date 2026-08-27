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
    // updateMany has no row limit, so the cap has to be applied by selecting
    // the batch first. Until now MAX_PER_RUN was declared and never used, which
    // meant a large backlog was rewritten in one unbounded statement.
    const batch = await prisma.documentScanJob.findMany({
      where: {
        status: { in: ["COMPLETED", "FAILED"] },
        updatedAt: { lt: cutoff },
        // Only clean if not already cleared
        NOT: { fileData: CLEARED_MARKER },
      },
      select: { id: true },
      orderBy: { updatedAt: "asc" },
      take: MAX_PER_RUN,
    });

    const result = await prisma.documentScanJob.updateMany({
      where: { id: { in: batch.map((j) => j.id) } },
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
