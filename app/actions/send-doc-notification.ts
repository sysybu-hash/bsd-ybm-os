"use server";

import { sendTransactionalEmail } from "@/lib/mail";
import { buildDocumentsHubUrl } from "@/lib/workspace-documents-url";
import { isPlaceholderVendor } from "@/lib/scan/v5-normalize";

export async function sendDocNotification(
  userEmail: string,
  vendor: string,
  total: number,
  opts?: { extractionIncomplete?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const erpUrl = buildDocumentsHubUrl("archive");
  const incomplete = opts?.extractionIncomplete === true;
  const displayVendor =
    vendor.trim() && !isPlaceholderVendor(vendor) ? vendor.trim() : "ספק לא זוהה";
  const displayTotal = Number.isFinite(total) && total > 0 ? total : null;
  const amountLine = displayTotal
    ? `₪${displayTotal.toLocaleString("he-IL")}`
    : "טרם זוהה — נדרשת השלמה בארכיון";
  const intro = incomplete
    ? "מסמך חדש נסרק, אך חלק מהשדות לא זוהו אוטומטית:"
    : "ה-AI פענח חשבונית חדשה:";
  const inner = `
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:800;color:#f8fafc;text-align:center;">מסמך חדש נסרק</h1>
    <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;text-align:center;">${intro}</p>
    <ul style="margin:0 auto 20px;padding:0;list-style:none;max-width:280px;color:#e2e8f0;font-size:15px;">
      <li style="margin:8px 0;"><strong>ספק:</strong> ${displayVendor.replace(/</g, "&lt;")}</li>
      <li style="margin:8px 0;"><strong>סכום:</strong> ${amountLine}</li>
    </ul>
    <p style="text-align:center;margin:0;">
      <a href="${erpUrl}" style="display:inline-block;background:#2563eb;color:#fff;font-weight:800;padding:12px 24px;border-radius:10px;text-decoration:none;">
        לצפייה ב-ERP
      </a>
    </p>`;
  return sendTransactionalEmail(
    userEmail.trim().toLowerCase(),
    incomplete ? "מסמך חדש נסרק (נדרשת השלמה)" : `מסמך חדש: ${displayVendor}`,
    inner,
  );
}
