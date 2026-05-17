import { emptyV5Base, type ScanExtractionV5, type ScanModeV5 } from "@/lib/scan-schema-v5";

function mergeDrawingResults(a: ScanExtractionV5, b: ScanExtractionV5, fileName: string): ScanExtractionV5 {
  const boqMap = new Map<string, (typeof a.billOfQuantities)[0]>();
  for (const row of [...a.billOfQuantities, ...b.billOfQuantities]) {
    const k = `${row.description}::${row.unit ?? ""}`;
    if (!boqMap.has(k)) boqMap.set(k, row);
  }
  const liMap = new Map<string, (typeof a.lineItems)[0]>();
  for (const row of [...a.lineItems, ...b.lineItems]) {
    const k = `${row.description}::${row.quantity ?? ""}`;
    if (!liMap.has(k)) liMap.set(k, row);
  }
  return emptyV5Base(fileName, "DRAWING_BOQ", {
    documentMetadata: {
      ...a.documentMetadata,
      project: a.documentMetadata.project ?? b.documentMetadata.project,
      client: a.documentMetadata.client ?? b.documentMetadata.client,
      documentDate: a.documentMetadata.documentDate ?? b.documentMetadata.documentDate,
      drawingRefs: [
        ...(a.documentMetadata.drawingRefs ?? []),
        ...(b.documentMetadata.drawingRefs ?? []),
      ],
      discipline: a.documentMetadata.discipline ?? b.documentMetadata.discipline,
    },
    billOfQuantities: [...boqMap.values()],
    lineItems: [...liMap.values()],
    vendor: a.vendor || b.vendor,
    total: Math.max(a.total, b.total),
    date: a.date ?? b.date,
    docType: a.docType || b.docType,
    summary: `${a.summary}\n---\n${b.summary}`.slice(0, 4000),
    enginesUsed: ["gemini", "openai"],
  });
}

/** ממזג תוצאות שני מנועי חילוץ לאותו מסמך */
export function mergeScanResults(
  primary: ScanExtractionV5,
  secondary: ScanExtractionV5,
  fileName: string,
  scanMode: ScanModeV5,
): ScanExtractionV5 {
  if (scanMode === "DRAWING_BOQ") return mergeDrawingResults(primary, secondary, fileName);
  const lineMap = new Map<string, (typeof primary.lineItems)[0]>();
  for (const row of [...primary.lineItems, ...secondary.lineItems]) {
    const key = `${row.description}::${row.quantity ?? ""}::${row.lineTotal ?? ""}`;
    if (!lineMap.has(key)) lineMap.set(key, row);
  }
  const boqMap = new Map<string, (typeof primary.billOfQuantities)[0]>();
  for (const row of [...primary.billOfQuantities, ...secondary.billOfQuantities]) {
    const key = `${row.itemRef ?? ""}::${row.description}::${row.quantity ?? ""}`;
    if (!boqMap.has(key)) boqMap.set(key, row);
  }
  return emptyV5Base(fileName, scanMode, {
    documentMetadata: {
      ...primary.documentMetadata,
      project: primary.documentMetadata.project ?? secondary.documentMetadata.project,
      client: primary.documentMetadata.client ?? secondary.documentMetadata.client,
      documentDate: primary.documentMetadata.documentDate ?? secondary.documentMetadata.documentDate,
      drawingRefs: [
        ...(primary.documentMetadata.drawingRefs ?? []),
        ...(secondary.documentMetadata.drawingRefs ?? []),
      ],
      discipline: primary.documentMetadata.discipline ?? secondary.documentMetadata.discipline,
      sheetIndex: primary.documentMetadata.sheetIndex ?? secondary.documentMetadata.sheetIndex,
    },
    billOfQuantities: [...boqMap.values()],
    lineItems: [...lineMap.values()],
    vendor: primary.vendor !== "לא צוין" ? primary.vendor : secondary.vendor,
    total: Math.max(primary.total, secondary.total),
    date: primary.date ?? secondary.date,
    docType: primary.docType !== "UNKNOWN" ? primary.docType : secondary.docType,
    summary: [primary.summary, secondary.summary].filter(Boolean).join("\n---\n").slice(0, 4000),
    enginesUsed: [...(primary.enginesUsed ?? []), ...(secondary.enginesUsed ?? [])],
  });
}

/** ממלא שדות חסרים אחרי מיזוג מנועים (חשבוניות) */
export function enrichInvoiceV5(v5: ScanExtractionV5): ScanExtractionV5 {
  if (v5.documentMetadata.scanMode !== "INVOICE_FINANCIAL") return v5;
  const dm = { ...v5.documentMetadata };
  if (!dm.documentDate && v5.date) dm.documentDate = v5.date;
  if (!dm.client && v5.vendor && v5.vendor !== "לא צוין") dm.client = v5.vendor;
  let total = v5.total;
  if ((!total || total <= 0) && v5.lineItems.length > 0) {
    const sum = v5.lineItems.reduce((acc, row) => acc + (Number(row.lineTotal) || 0), 0);
    if (sum > 0) total = sum;
  }
  return { ...v5, documentMetadata: dm, total };
}
