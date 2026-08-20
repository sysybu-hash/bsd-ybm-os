import { enrichInvoiceV5 } from "@/lib/tri-engine-merge";
import {
  isPlaceholderVendor,
  pickTotalFromRaw,
  pickVendorFromRaw,
  sumLineItemsTotal,
} from "@/lib/scan/v5-normalize";
import type { LineItemV5, ScanExtractionV5 } from "@/lib/scan-schema-v5";
import { coerceLegacyAiToV5 } from "@/lib/scan-schema-v5";

export type DocNotificationFields = {
  vendor: string;
  total: number;
  /** חילוץ חלש — אין ספק ואין סכום משמעותי */
  extractionIncomplete: boolean;
};

function lineItemsFromAiData(aiData: Record<string, unknown>): LineItemV5[] {
  const raw = aiData.lineItems;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const o = row as Record<string, unknown>;
      return {
        description: typeof o.description === "string" ? o.description : "",
        quantity: typeof o.quantity === "number" ? o.quantity : undefined,
        unitPrice: typeof o.unitPrice === "number" ? o.unitPrice : undefined,
        lineTotal: typeof o.lineTotal === "number" ? o.lineTotal : undefined,
      };
    })
    .filter((x) => x && x.description) as LineItemV5[];
}

function v5FromAiData(aiData: Record<string, unknown>): ScanExtractionV5 | null {
  const embedded = aiData._v5;
  if (embedded && typeof embedded === "object") {
    return enrichInvoiceV5(embedded as ScanExtractionV5);
  }
  if (aiData.schemaVersion === 5) {
    return enrichInvoiceV5(
      coerceLegacyAiToV5(aiData, "document", "INVOICE_FINANCIAL"),
    );
  }
  return null;
}

/** מפיק שדות מייל אמינים מתוצאת סריקה (V5 או legacy) */
export function resolveDocNotificationFields(
  aiData: Record<string, unknown>,
): DocNotificationFields {
  const v5 = v5FromAiData(aiData);
  if (v5) {
    const hasVendor = !isPlaceholderVendor(v5.vendor);
    const hasTotal = v5.total > 0;
    const hasPricedLines = sumLineItemsTotal(v5.lineItems) > 0;
    return {
      vendor: hasVendor ? v5.vendor : "ספק לא זוהה",
      total: hasTotal ? v5.total : hasPricedLines ? sumLineItemsTotal(v5.lineItems) : 0,
      extractionIncomplete: !hasVendor && !hasTotal && !hasPricedLines,
    };
  }

  const meta =
    aiData.metadata && typeof aiData.metadata === "object"
      ? (aiData.metadata as Record<string, unknown>)
      : null;
  const client =
    meta && typeof meta.client === "string" ? meta.client : null;
  const lineItems = lineItemsFromAiData(aiData);
  const vendorRaw = pickVendorFromRaw(aiData, client);
  const total = pickTotalFromRaw(aiData, lineItems);
  const hasVendor = !isPlaceholderVendor(vendorRaw);
  const hasTotal = total > 0;
  const hasPricedLines = sumLineItemsTotal(lineItems) > 0;

  return {
    vendor: hasVendor ? vendorRaw : "ספק לא זוהה",
    total: hasTotal ? total : hasPricedLines ? sumLineItemsTotal(lineItems) : 0,
    extractionIncomplete: !hasVendor && !hasTotal && !hasPricedLines,
  };
}
