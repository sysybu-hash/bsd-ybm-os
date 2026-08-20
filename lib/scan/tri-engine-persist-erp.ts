/**
 * התמדת תוצאת סריקת tri-engine ל-ERP (Drive → Document → שורות → התראות → תובנות).
 * פוצל מ-tri-engine-api-common.ts — ללא שינוי התנהגות.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { persistDocumentLineItemsFromAiData } from "@/lib/persist-document-lines";
import { sendDocNotification } from "@/app/actions/send-doc-notification";
import { resolveDocNotificationFields } from "@/lib/scan/notification-fields";
import { getPriceSpikeAlerts, type PriceSpikeAlert } from "@/lib/erp-price-spikes";
import { filterAlertsForScan } from "@/lib/scan-sync-summary";
import { archiveScanToDrive } from "@/lib/scan-archive-to-drive";
import { runScanInsights, type ScanInsights } from "@/lib/scan-insights";
import { notifyUser } from "@/lib/notify-user";

export async function persistTriEngineToErp(params: {
  file: File;
  aiData: Record<string, unknown>;
  userId: string;
  organizationId: string;
}): Promise<{
  documentId: string;
  priceSpikes: PriceSpikeAlert[];
  driveWebViewLink?: string | null;
  insights?: ScanInsights | null;
}> {
  const { file, aiData, userId, organizationId } = params;

  // ── 1. שמירה ל-Google Drive (לא חוסמת — מכשל שקט אם Drive לא מחובר) ──────
  const driveResult = await archiveScanToDrive(userId, file);
  const fileDriveId = driveResult.ok ? driveResult.driveFileId : null;
  const fileDriveWebViewLink = driveResult.ok ? driveResult.driveWebViewLink : null;

  // ── 2. יצירת רשומת Document ב-DB ──────────────────────────────────────────
  const doc = await prisma.document.create({
    data: {
      fileName: file.name,
      type: String(aiData.docType ?? "UNKNOWN"),
      status: "PROCESSED",
      aiData: aiData as Prisma.InputJsonValue,
      fileDriveId,
      fileDriveWebViewLink,
      userId,
      organizationId,
    },
  });

  await persistDocumentLineItemsFromAiData(
    doc.id,
    organizationId,
    typeof aiData.vendor === "string" ? aiData.vendor : null,
    aiData,
    {
      notifyUserId: userId,
      fileLabel: file.name,
    },
  );

  const priceSpikes = await detectAndNotifyPriceSpikes({
    organizationId,
    userId,
    documentId: doc.id,
    aiData,
  });

  const emailRow = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (emailRow?.email) {
    const notify = resolveDocNotificationFields(aiData);
    await sendDocNotification(emailRow.email, notify.vendor, notify.total, {
      extractionIncomplete: notify.extractionIncomplete,
    });
  }

  // ── 5. תובנות עסקיות (כפילויות, ספק↔פרויקט, תנאי תשלום) ──────────────────
  const insights = await runScanInsights({
    organizationId,
    vendor: String(aiData.vendor ?? ""),
    total: Number(aiData.total ?? 0),
    date: typeof aiData.date === "string" ? aiData.date : null,
    summary: typeof aiData.summary === "string" ? aiData.summary : "",
    documentId: doc.id,
  }).catch(() => null);

  return {
    documentId: doc.id,
    priceSpikes,
    driveWebViewLink: fileDriveWebViewLink,
    insights,
  };
}

async function detectAndNotifyPriceSpikes(params: {
  organizationId: string;
  userId: string;
  documentId: string;
  aiData: Record<string, unknown>;
}): Promise<PriceSpikeAlert[]> {
  const { organizationId, userId, documentId, aiData } = params;
  try {
    const allSpikes = await getPriceSpikeAlerts(organizationId, 32);
    if (allSpikes.length === 0) return [];

    const relevant = filterAlertsForScan(allSpikes, aiData);
    if (relevant.length === 0) return [];

    const top = relevant[0]!;
    const moreCount = relevant.length - 1;
    const title = `⚠️ זוהתה קפיצת מחיר בסריקה`;
    const bodyLead = `${top.description}: +${top.changePercent.toFixed(1)}% (₪${top.previousPrice.toFixed(2)} → ₪${top.latestPrice.toFixed(2)})`;
    const body = moreCount > 0 ? `${bodyLead} ועוד ${moreCount} פריטים` : bodyLead;

    await notifyUser(userId, title, body);
    void documentId;

    return relevant;
  } catch {
    return [];
  }
}
