import { prisma } from "@/lib/prisma";
import { normalizeProductKey } from "@/lib/normalize-product-key";

type LineJson = {
  description?: string;
  quantity?: number;
  unitPrice?: number;
  lineTotal?: number;
  sku?: string;
};

function num(n: unknown): number | null {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim()) {
    const v = parseFloat(n.replace(/,/g, ""));
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

/** כשאין lineItems אך יש billOfQuantities — יוצרים שורות ל־DocumentLineItem (ללא מחיר, לצורך ERP/השוואות כמותיות) */
function lineItemLikeRowsFromBillOfQuantities(aiData: Record<string, unknown>): Array<Record<string, unknown>> {
  const boq = aiData.billOfQuantities;
  if (!Array.isArray(boq) || boq.length === 0) return [];

  const out: Array<Record<string, unknown>> = [];
  for (const row of boq) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const desc = typeof r.description === "string" ? r.description.trim() : "";
    if (!desc) continue;
    const unit = typeof r.unit === "string" ? r.unit.trim() : "";
    const qty = num(r.quantity);
    const suffix = unit ? ` · ${unit}` : "";
    out.push({
      description: `${desc}${suffix}`,
      quantity: qty ?? undefined,
      unitPrice: undefined,
      lineTotal: undefined,
    });
  }
  return out;
}

export type PersistLineItemsOptions = {
  /**
   * כשהתוצאה הגיעה ממטמון סריקה — שומרים שורות מסמך לצורכי תצוגה,
   * בלי ליצור שוב תצפיות מחיר (מניעת כפילות בלוח ההשוואות).
   */
  skipPriceObservations?: boolean;
  /** משתמש לקבלת התראה בתיבת הדואר פנימית כשיש שורות ללא מחיר */
  notifyUserId?: string;
  /** כותרת מסמך להודעה (שם קובץ) */
  fileLabel?: string;
  /** כש true — לא נוצרת התראה in-app (למשל כפילות ממטמון סריקה) */
  skipNotification?: boolean;
};

export async function persistDocumentLineItemsFromAiData(
  documentId: string,
  organizationId: string,
  vendor: string | null,
  aiData: Record<string, unknown>,
  options?: PersistLineItemsOptions,
): Promise<void> {
  const skipObs = options?.skipPriceObservations === true;
  const notifyUserId = options?.notifyUserId?.trim();
  const fileLabel = options?.fileLabel?.trim() || "מסמך";
  const skipNotification = options?.skipNotification === true;
  let raw: unknown = aiData.lineItems;
  if (!Array.isArray(raw) || raw.length === 0) {
    const fromBoq = lineItemLikeRowsFromBillOfQuantities(aiData);
    if (fromBoq.length === 0) return;
    raw = fromBoq;
  }

  const supplierName = vendor?.trim() || (typeof aiData.vendor === "string" ? aiData.vendor : null);

  const rows = raw as unknown[];
  let priceAlertLineCount = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as LineJson;
    const desc = typeof r.description === "string" ? r.description.trim() : "";
    if (!desc) continue;

    const normalizedKey = normalizeProductKey(desc);
    const qty = num(r.quantity);
    const unitPrice = num(r.unitPrice);
    const lineTotal = num(r.lineTotal);
    const sku = typeof r.sku === "string" ? r.sku.trim() : null;

    const priceForObs = unitPrice ?? (qty != null && qty > 0 && lineTotal != null ? lineTotal / qty : lineTotal);
    const hasPositivePrice = priceForObs != null && priceForObs > 0;
    const priceAlertPending = !hasPositivePrice;

    if (priceAlertPending) priceAlertLineCount += 1;

    await prisma.documentLineItem.create({
      data: {
        documentId,
        organizationId,
        supplierName,
        description: desc,
        normalizedKey,
        quantity: qty ?? undefined,
        unitPrice: unitPrice ?? undefined,
        lineTotal: lineTotal ?? undefined,
        sku: sku || undefined,
        priceAlertPending,
      },
    });

    if (
      !skipObs &&
      priceForObs != null &&
      priceForObs > 0
    ) {
      await prisma.productPriceObservation.create({
        data: {
          organizationId,
          documentId,
          normalizedKey,
          description: desc,
          supplierName,
          unitPrice: priceForObs,
        },
      });
    }
  }

  if (
    notifyUserId &&
    !skipNotification &&
    priceAlertLineCount > 0
  ) {
    await prisma.inAppNotification.create({
      data: {
        userId: notifyUserId,
        title: "השלמת מחיר נדרשת (ERP)",
        body: `${priceAlertLineCount} שורות ב«${fileLabel}» זוהו ללא מחיר — הזינו מחיר ידנית בלוח ERP.`,
      },
    });
  }
}
