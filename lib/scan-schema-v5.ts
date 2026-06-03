/**
 * סכימת פלט מאוחדת V5 — כל מסלולי ה-Tri-Engine מחזירים אובייקט תואם (לפני/אחרי נירמול).
 */
export const SCAN_SCHEMA_V5 = 5 as const;

export type ScanModeV5 =
  | "INVOICE_FINANCIAL"
  | "DRAWING_BOQ"
  | "GENERAL_DOCUMENT"
  | "QUOTE_BOQ"
  | "PROGRESS_BILL"
  | "SITE_LOG"
  // Step 7 — new document types
  | "PAYSLIP"           // תלוש שכר
  | "BANK_STATEMENT"    // דוח בנק / תדפיס
  | "DELIVERY_NOTE"     // תעודת משלוח / ת"ח
  | "PURCHASE_ORDER"    // הזמנת רכש (PO)
  | "CONTRACT";         // חוזה / הסכם

export type DocumentMetadataV5 = {
  project: string | null;
  client: string | null;
  documentDate: string | null;
  drawingRefs: string[] | null;
  discipline: string | null;
  sheetIndex: string | null;
  sourceFileName: string | null;
  scanMode: ScanModeV5;
};

export type BillOfQuantityRowV5 = {
  itemRef: string | null;
  description: string;
  material: string | null;
  dimensions: string | null;
  mepPoints: string[] | null;
  quantity: number | null;
  unit: string | null;
  notes: string | null;
};

export type LineItemV5 = {
  description: string;
  quantity?: number;
  unitPrice?: number; // מחיר יחידה (ללא מע"מ)
  lineTotal?: number; // סך הכל לשורה (ללא מע"מ)
  vatAmount?: number; // סכום המע"מ לשורה (אם מופיע)
  currency?: "ILS" | "USD" | "EUR"; // עצירת זיופי מטבעות
  sku?: string;
};

/** תוצאת Tri-Engine — שדות root לתאימות ל-persist-document-lines ול-ERP */
export type ScanExtractionV5 = {
  schemaVersion: typeof SCAN_SCHEMA_V5;
  documentMetadata: DocumentMetadataV5;
  billOfQuantities: BillOfQuantityRowV5[];
  lineItems: LineItemV5[];
  /** ח"פ / ע.מ של הספק */
  taxId?: string | null;
  /** סיכום כללי — שומרים גם ב-vendor/total/date/docType/summary לתאימות לאחור */
  vendor: string;
  total: number;
  date: string | null;
  docType: string;
  summary: string;
  /** true אם יש לפחות שורה עם מחיר חסר/אפס (המשך עיבוד ב-ERP) */
  priceAlertPending: boolean;
  /** מטא-דאטה מהמנועים (לא חובה לשמירה ב-DB) */
  enginesUsed?: string[];
};

export function emptyV5Base(
  fileName: string,
  scanMode: ScanModeV5,
  partial?: Partial<ScanExtractionV5>,
): ScanExtractionV5 {
  const lineItems = partial?.lineItems ?? [];
  const boq = partial?.billOfQuantities ?? [];
  const merged: ScanExtractionV5 = {
    schemaVersion: SCAN_SCHEMA_V5,
    documentMetadata: {
      project: partial?.documentMetadata?.project ?? null,
      client: partial?.documentMetadata?.client ?? null,
      documentDate: partial?.documentMetadata?.documentDate ?? null,
      drawingRefs: partial?.documentMetadata?.drawingRefs ?? null,
      discipline: partial?.documentMetadata?.discipline ?? null,
      sheetIndex: partial?.documentMetadata?.sheetIndex ?? null,
      sourceFileName: fileName,
      scanMode,
      ...partial?.documentMetadata,
    },
    billOfQuantities: boq,
    lineItems,
    taxId: partial?.taxId ?? null,
    vendor: partial?.vendor ?? "לא צוין",
    total: partial?.total ?? 0,
    date: partial?.date ?? null,
    docType: partial?.docType ?? "UNKNOWN",
    summary: partial?.summary ?? "",
    priceAlertPending: partial?.priceAlertPending ?? computePriceAlertPending(lineItems),
    enginesUsed: partial?.enginesUsed,
  };
  merged.priceAlertPending = computePriceAlertPending(merged.lineItems);
  return merged;
}

export function computePriceAlertPending(items: LineItemV5[]): boolean {
  if (!items.length) return false;
  return items.some((row) => {
    const up = row.unitPrice;
    const lt = row.lineTotal;
    const q = row.quantity;
    if (up != null && Number.isFinite(up) && up > 0) return false;
    if (lt != null && Number.isFinite(lt) && lt > 0) {
      if (q != null && q > 0) {
        const implied = lt / q;
        if (Number.isFinite(implied) && implied > 0) return false;
      }
      return false;
    }
    return true;
  });
}

/** מיזוג שדות מ-AI גולמי (מבנה ישן) לתוך V5 */
export function coerceLegacyAiToV5(
  raw: Record<string, unknown>,
  fileName: string,
  scanMode: ScanModeV5,
): ScanExtractionV5 {
  const meta = raw.metadata;
  const mrec = meta && typeof meta === "object" ? (meta as Record<string, unknown>) : null;
  const dm: DocumentMetadataV5 = {
    project: mrec && typeof mrec.project === "string" ? mrec.project : null,
    client: mrec && typeof mrec.client === "string" ? mrec.client : null,
    documentDate: mrec && typeof mrec.documentDate === "string" ? mrec.documentDate : null,
    drawingRefs: mrec && Array.isArray(mrec.drawingRefs) ? (mrec.drawingRefs as string[]) : null,
    discipline: mrec && typeof mrec.discipline === "string" ? mrec.discipline : null,
    sheetIndex: mrec && typeof mrec.sheetIndex === "string" ? mrec.sheetIndex : null,
    sourceFileName: fileName,
    scanMode,
  };

  const boqRaw = raw.billOfQuantities;
  const billOfQuantities: BillOfQuantityRowV5[] = Array.isArray(boqRaw)
    ? boqRaw
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const o = r as Record<string, unknown>;
          return {
            itemRef: typeof o.itemRef === "string" ? o.itemRef : null,
            description: typeof o.description === "string" ? o.description : "",
            material: typeof o.material === "string" ? o.material : null,
            dimensions: typeof o.dimensions === "string" ? o.dimensions : null,
            mepPoints: Array.isArray(o.mepPoints) ? (o.mepPoints as string[]) : null,
            quantity: typeof o.quantity === "number" ? o.quantity : null,
            unit: typeof o.unit === "string" ? o.unit : null,
            notes: typeof o.notes === "string" ? o.notes : null,
          };
        })
        .filter(Boolean) as BillOfQuantityRowV5[]
    : [];

  const liRaw = raw.lineItems;
  const lineItems: LineItemV5[] = Array.isArray(liRaw)
    ? liRaw
        .map((r) => {
          if (!r || typeof r !== "object") return null;
          const o = r as Record<string, unknown>;
          const currencyRaw = o.currency;
          const currency =
            currencyRaw === "ILS" || currencyRaw === "USD" || currencyRaw === "EUR"
              ? currencyRaw
              : undefined;
          return {
            description: typeof o.description === "string" ? o.description : "",
            quantity: typeof o.quantity === "number" ? o.quantity : undefined,
            unitPrice: typeof o.unitPrice === "number" ? o.unitPrice : undefined,
            lineTotal: typeof o.lineTotal === "number" ? o.lineTotal : undefined,
            vatAmount: typeof o.vatAmount === "number" ? o.vatAmount : undefined,
            currency,
            sku: typeof o.sku === "string" ? o.sku : undefined,
          };
        })
        .filter((x) => x && x.description) as LineItemV5[]
    : [];

  const vendor = typeof raw.vendor === "string" ? raw.vendor : "לא צוין";
  const taxId = typeof raw.taxId === "string" ? raw.taxId : null;
  const total = typeof raw.total === "number" ? raw.total : 0;
  const date = typeof raw.date === "string" ? raw.date : null;
  const docType = typeof raw.docType === "string" ? raw.docType : "UNKNOWN";
  const summary = typeof raw.summary === "string" ? raw.summary : "";

  return emptyV5Base(fileName, scanMode, {
    documentMetadata: dm,
    billOfQuantities,
    lineItems,
    vendor,
    taxId,
    total,
    date,
    docType,
    summary,
  });
}

export function v5ToPersistableAiData(v: ScanExtractionV5): Record<string, unknown> {
  return {
    schemaVersion: v.schemaVersion,
    documentMetadata: v.documentMetadata,
    billOfQuantities: v.billOfQuantities,
    lineItems: v.lineItems,
    vendor: v.vendor,
    taxId: v.taxId,
    total: v.total,
    date: v.date,
    docType: v.docType,
    summary: v.summary,
    priceAlertPending: v.priceAlertPending,
    metadata: {
      project: v.documentMetadata.project,
      client: v.documentMetadata.client,
      documentDate: v.documentMetadata.documentDate,
      drawingRefs: v.documentMetadata.drawingRefs,
      discipline: v.documentMetadata.discipline,
      sheetIndex: v.documentMetadata.sheetIndex,
    },
  };
}

export function buildV5JsonInstruction(
  localeLang: string,
  scanMode: ScanModeV5,
  industryRaw?: string | null,
): string {
  const isCompany =
    String(industryRaw ?? "")
      .trim()
      .toUpperCase()
      .replace(/-/g, "_") === "COMPANY_MGMT" ||
    String(industryRaw ?? "").trim().toUpperCase() === "BUSINESS";
  const baseShape = `Return ONLY one JSON object (no markdown). Shape:
{
  "schemaVersion": 5,
  "documentMetadata": {
    "project": string | null,
    "client": string | null,
    "documentDate": string | null,
    "drawingRefs": string[] | null,
    "discipline": string | null,
    "sheetIndex": string | null,
    "sourceFileName": string | null,
    "scanMode": "${scanMode}"
  },
  "billOfQuantities": Array<{ "itemRef": string | null, "description": string, "material": string | null, "dimensions": string | null, "mepPoints": string[] | null, "quantity": number | null, "unit": string | null, "notes": string | null }>,
  "lineItems": Array<{ "description": string, "quantity"?: number, "unitPrice"?: number, "lineTotal"?: number, "vatAmount"?: number, "currency"?: "ILS" | "USD" | "EUR", "sku"?: string }>,
  "vendor": string,
  "taxId": string | null,
  "total": number,
  "date": string | null,
  "docType": string,
  "summary": string,
  "priceAlertPending": boolean
}`;

  if (scanMode === "INVOICE_FINANCIAL") {
    return `You are a strict financial auditor. Extract deterministic invoice/receipt data for Israeli ERP.
${baseShape}
RULES:
- Populate "lineItems" from every priced row: quantity, unitPrice, lineTotal, VAT if visible.
- "vendor" = supplier name; "taxId" = Israeli tax ID (ח"פ / ע.מ) if found; "total" = grand total numeric; "priceAlertPending" = true if any line lacks positive unit price.
- "billOfQuantities" may be empty.
- Human-readable strings in ${localeLang}.`;
  }

  if (isCompany && (scanMode === "DRAWING_BOQ" || scanMode === "QUOTE_BOQ" || scanMode === "SITE_LOG" || scanMode === "PROGRESS_BILL")) {
    return `You are a business document analyst for Israeli companies (contracts, proposals, reports — not construction sites).
${baseShape}
RULES:
- "summary" captures parties, dates, amounts, obligations.
- Use "lineItems" for priced rows; avoid construction BOQ jargon unless explicitly present.
- "billOfQuantities" usually empty for office documents.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "DRAWING_BOQ") {
    return `You are a Senior Quantity Surveyor (כמי"ס). Scan ALL pages. Find Legend (מקרא). Extract BOQ rows with SI units (m, m², m³, יח׳).
${baseShape}
RULES:
- Fill "billOfQuantities" richly; map each BOQ row also into "lineItems" with description + quantity + unit (prices null if unknown).
- "priceAlertPending" true if any line item is missing unit price when invoice-like amounts appear.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "QUOTE_BOQ") {
    return `You are extracting a contractor quote / BOQ (הצעת מחיר / כתב כמויות).
${baseShape}
RULES:
- Populate "billOfQuantities" with itemRef, description, quantity, unit, material, dimensions.
- Map priced rows to "lineItems" with unitPrice/lineTotal when visible.
- "docType" should reflect quote/BOQ; "summary" lists scope and assumptions.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "SITE_LOG") {
    return `You are extracting a construction site daily log (יומן עבודה / דוח שטח).
${baseShape}
RULES:
- "summary" must capture weather, crew, work done, issues, deliveries.
- Use "lineItems" for discrete work items or incidents; "billOfQuantities" may list materials/equipment.
- "documentMetadata.documentDate" = log date if found; "project" and "client" from header.
- "priceAlertPending": false unless invoice amounts appear.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "PROGRESS_BILL") {
    return `You are extracting a progress billing / interim payment certificate (חשבון התקדמות / חלקי).
${baseShape}
RULES:
- Fill "lineItems" with section descriptions, cumulative %, amounts billed this period.
- "billOfQuantities" for BOQ lines with progress % and quantities.
- "total" = amount due this bill; note retention/advance in "summary" if visible.
- Human-readable strings in ${localeLang}.`;
  }

  // ── Step 7: New document types ────────────────────────────────────────────

  if (scanMode === "PAYSLIP") {
    return `You are extracting an Israeli payslip (תלוש שכר).
${baseShape}
RULES:
- "vendor" = employer name; "taxId" = employer tax ID (מספר עוסק/ח"פ) if present.
- "total" = net pay (שכר נטו) as numeric value in ILS.
- "lineItems": each salary component as a row — base salary (שכר בסיס), overtime (שעות נוספות), deductions (ניכויים), social insurance (ביטוח לאומי), income tax (מס הכנסה), pension (פנסיה), etc. Use description + lineTotal for each.
- "documentMetadata.documentDate" = pay period end date.
- "summary": employee name, ID number (תעודת זהות — REDACT in logs), employer, gross/net.
- "docType": "PAYSLIP".
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "BANK_STATEMENT") {
    return `You are extracting an Israeli bank statement (תדפיס בנק / דוח חשבון).
${baseShape}
RULES:
- "vendor" = bank name + branch; "total" = closing balance (יתרה סופית) as numeric.
- "lineItems": each transaction row — description, date in description field, debit or credit amount in lineTotal (positive = credit, negative = debit).
- "documentMetadata.documentDate" = statement end date; "project" = account number if visible.
- "summary": account holder name, account number, opening/closing balance, period.
- "docType": "BANK_STATEMENT".
- "billOfQuantities" empty.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "DELIVERY_NOTE") {
    return `You are extracting a delivery note / תעודת משלוח (also called ת"ח or delivery order).
${baseShape}
RULES:
- "vendor" = supplier/shipper name; "total" = total value if shown (may be 0 if prices omitted).
- "lineItems": each delivered item — description, quantity, unit, unit price if shown.
- "taxId" = supplier tax ID if present.
- "documentMetadata.documentDate" = delivery date.
- "summary": from/to parties, delivery number, destination address, notes.
- "docType": "DELIVERY_NOTE".
- "priceAlertPending": true if any item lacks a price and this looks like a priced document.
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "PURCHASE_ORDER") {
    return `You are extracting a purchase order (הזמנת רכש / PO).
${baseShape}
RULES:
- "vendor" = supplier name; "total" = total PO value; "taxId" = supplier tax ID if present.
- "lineItems": each ordered item — description, quantity, unit price, line total, SKU if visible.
- "documentMetadata.project" = PO number or project reference.
- "summary": buyer, supplier, PO number, delivery terms, payment terms.
- "docType": "PURCHASE_ORDER".
- Human-readable strings in ${localeLang}.`;
  }

  if (scanMode === "CONTRACT") {
    return `You are extracting a contract or legal agreement (חוזה / הסכם).
${baseShape}
RULES:
- "vendor" = service provider / contractor name; "taxId" = their tax ID if present.
- "total" = total contract value or monthly fee as numeric; 0 if not specified.
- "lineItems": key financial obligations — each fee, payment milestone, or price item.
- "documentMetadata.documentDate" = contract signing date.
- "summary": parties (first party, second party), contract scope, duration, key obligations, payment terms, termination conditions (all in ${localeLang}).
- "docType": "CONTRACT".
- "billOfQuantities" empty unless it's a construction contract with BOQ.
- Human-readable strings in ${localeLang}.`;
  }

  return `Fast document understanding — summary and entities only.
${baseShape}
RULES:
- Prefer short "summary", "docType", tags in metadata; minimal "lineItems" and "billOfQuantities" unless obvious.
- "priceAlertPending": false unless unclear pricing.
- Human-readable strings in ${localeLang}.`;
}

/**
 * גרסה מורחבת של buildV5JsonInstruction שמצרפת הנחיות ענף+מקצוע מ-getMergedIndustryConfig.
 * משמשת בתוך tri-engine-extract.ts כדי שה-AI יידע מה השדות המדויקים לחלץ לפי המקצוע.
 *
 * @param industryExtras - הפלט של industryInstructionExtras() מ-tri-engine-extract (כבר מחושב שם).
 *                         מועבר כפרמטר כדי לא לדרוש import מעגלי.
 */
export function buildV5JsonInstructionWithExtras(
  localeLang: string,
  scanMode: ScanModeV5,
  industryRaw: string | null,
  industryExtras: string,
): string {
  const base = buildV5JsonInstruction(localeLang, scanMode, industryRaw);
  return industryExtras ? `${base}\n\n${industryExtras}` : base;
}
