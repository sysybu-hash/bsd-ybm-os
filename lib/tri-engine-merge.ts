import {
  isPlaceholderVendor,
  sumLineItemsTotal,
} from "@/lib/scan/v5-normalize";
import {
  clampConfidenceScore,
  DEFAULT_CONFIDENCE_SCORE,
  emptyV5Base,
  type ScanExtractionV5,
  type ScanModeV5,
} from "@/lib/scan-schema-v5";

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
    confidenceScore: maxConfidence(a.confidenceScore, b.confidenceScore),
    enginesUsed: ["gemini", "openai"],
  });
}

/** הביטחון הגבוה מבין שני המנועים (null אם לשניהם אין) */
function maxConfidence(a?: number | null, b?: number | null): number | null {
  const vals = [a, b].filter((v): v is number => typeof v === "number");
  return vals.length ? Math.max(...vals) : null;
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
    confidenceScore: maxConfidence(primary.confidenceScore, secondary.confidenceScore),
    enginesUsed: [...(primary.enginesUsed ?? []), ...(secondary.enginesUsed ?? [])],
  });
}

// ── N-way merge with confidence-weighted field voting (P0.3) ────────────────
// mergeScanResults is pairwise — folding it over N engines loses the notion of
// "which value did most engines, weighted by confidence, agree on". For 3+
// engines we instead vote per scalar field and record which engine won each
// field in `fieldProvenance` (consumed by the Command Center UI + telemetry).

const engineLabelOf = (r: ScanExtractionV5): string => r.enginesUsed?.[0] ?? "unknown";
const weightOf = (r: ScanExtractionV5): number =>
  clampConfidenceScore(r.confidenceScore) ?? DEFAULT_CONFIDENCE_SCORE;

type Vote<T> = { value: T; weight: number; engine: string };

/** בוחר את הערך עם משקל-הביטחון המצטבר הגבוה ביותר; שובר שוויון לפי המנוע הראשון. */
function weightedPick<T>(votes: Vote<T>[], keyOf: (v: T) => string): Vote<T> | null {
  const groups = new Map<string, Vote<T>>();
  for (const vote of votes) {
    const k = keyOf(vote.value);
    const existing = groups.get(k);
    if (existing) existing.weight += vote.weight;
    else groups.set(k, { ...vote });
  }
  let best: Vote<T> | null = null;
  for (const g of groups.values()) {
    if (!best || g.weight > best.weight) best = g;
  }
  return best;
}

/**
 * ממזג N תוצאות מנועים למסמך אחד עם הצבעה משוקללת-ביטחון על שדות סקלריים.
 * שורות (lineItems/BOQ) מאוחדות ומנוקות מכפילויות מכל המנועים.
 * ל-DRAWING_BOQ נשמרת ההתנהגות הזוגית הקיימת (מיזוג ציורי).
 */
export function mergeScanResultsMany(
  results: ScanExtractionV5[],
  fileName: string,
  scanMode: ScanModeV5,
): ScanExtractionV5 {
  if (results.length === 0) return emptyV5Base(fileName, scanMode);
  if (results.length === 1) return results[0]!;
  if (scanMode === "DRAWING_BOQ") {
    return results.reduce((acc, next) => mergeScanResults(acc, next, fileName, scanMode));
  }

  const lineMap = new Map<string, (typeof results)[number]["lineItems"][number]>();
  for (const r of results) {
    for (const row of r.lineItems) {
      const key = `${row.description}::${row.quantity ?? ""}::${row.lineTotal ?? ""}`;
      if (!lineMap.has(key)) lineMap.set(key, row);
    }
  }
  const boqMap = new Map<string, (typeof results)[number]["billOfQuantities"][number]>();
  for (const r of results) {
    for (const row of r.billOfQuantities) {
      const key = `${row.itemRef ?? ""}::${row.description}::${row.quantity ?? ""}`;
      if (!boqMap.has(key)) boqMap.set(key, row);
    }
  }

  const provenance: Record<string, string> = {};

  const vendorPick = weightedPick(
    results
      .filter((r) => !isPlaceholderVendor(r.vendor))
      .map((r) => ({ value: r.vendor, weight: weightOf(r), engine: engineLabelOf(r) })),
    (v) => v.trim().toLowerCase(),
  );
  if (vendorPick) provenance.vendor = vendorPick.engine;

  const totalPick = weightedPick(
    results
      .filter((r) => Number.isFinite(r.total) && r.total > 0)
      .map((r) => ({ value: r.total, weight: weightOf(r), engine: engineLabelOf(r) })),
    (v) => String(Math.round(v)),
  );
  if (totalPick) provenance.total = totalPick.engine;

  const datePick = weightedPick(
    results
      .filter((r): r is ScanExtractionV5 & { date: string } => Boolean(r.date))
      .map((r) => ({ value: r.date, weight: weightOf(r), engine: engineLabelOf(r) })),
    (v) => v,
  );
  if (datePick) provenance.date = datePick.engine;

  const taxIdPick = weightedPick(
    results
      .filter((r): r is ScanExtractionV5 & { taxId: string } => Boolean(r.taxId))
      .map((r) => ({ value: r.taxId, weight: weightOf(r), engine: engineLabelOf(r) })),
    (v) => v.replace(/\D/g, ""),
  );
  if (taxIdPick) provenance.taxId = taxIdPick.engine;

  const docTypePick = weightedPick(
    results
      .filter((r) => r.docType && r.docType !== "UNKNOWN")
      .map((r) => ({ value: r.docType, weight: weightOf(r), engine: engineLabelOf(r) })),
    (v) => v,
  );
  if (docTypePick) provenance.docType = docTypePick.engine;

  const primary = results[0]!;
  const confidenceScore = results.reduce<number | null>(
    (best, r) => maxConfidence(best, r.confidenceScore),
    null,
  );

  return emptyV5Base(fileName, scanMode, {
    documentMetadata: {
      ...primary.documentMetadata,
      project: results.map((r) => r.documentMetadata.project).find(Boolean) ?? null,
      client: results.map((r) => r.documentMetadata.client).find(Boolean) ?? null,
      documentDate:
        results.map((r) => r.documentMetadata.documentDate).find(Boolean) ?? null,
      drawingRefs: results.flatMap((r) => r.documentMetadata.drawingRefs ?? []),
      discipline: results.map((r) => r.documentMetadata.discipline).find(Boolean) ?? null,
      sheetIndex: results.map((r) => r.documentMetadata.sheetIndex).find(Boolean) ?? null,
    },
    billOfQuantities: [...boqMap.values()],
    lineItems: [...lineMap.values()],
    vendor: vendorPick?.value ?? primary.vendor,
    total: totalPick?.value ?? Math.max(...results.map((r) => r.total)),
    date: datePick?.value ?? null,
    taxId: taxIdPick?.value ?? null,
    docType: docTypePick?.value ?? "UNKNOWN",
    summary: results.map((r) => r.summary).filter(Boolean).join("\n---\n").slice(0, 4000),
    confidenceScore,
    enginesUsed: results.flatMap((r) => r.enginesUsed ?? []),
    fieldProvenance: provenance,
  });
}

/** ממלא שדות חסרים אחרי מיזוג מנועים (חשבוניות / חשבון חלקי) */
export function enrichInvoiceV5(v5: ScanExtractionV5): ScanExtractionV5 {
  const mode = v5.documentMetadata.scanMode;
  if (mode !== "INVOICE_FINANCIAL" && mode !== "PROGRESS_BILL") return v5;

  const dm = { ...v5.documentMetadata };
  if (!dm.documentDate && v5.date) dm.documentDate = v5.date;

  let vendor = v5.vendor;
  if (isPlaceholderVendor(vendor) && dm.client && !isPlaceholderVendor(dm.client)) {
    vendor = dm.client;
  }
  if (!isPlaceholderVendor(vendor)) {
    if (!dm.client || isPlaceholderVendor(dm.client)) dm.client = vendor;
  }

  let total = v5.total;
  if (!Number.isFinite(total) || total <= 0) {
    const fromLines = sumLineItemsTotal(v5.lineItems);
    if (fromLines > 0) total = fromLines;
  }

  return { ...v5, documentMetadata: dm, vendor, total };
}
