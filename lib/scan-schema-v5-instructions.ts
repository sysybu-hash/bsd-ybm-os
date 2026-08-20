import type { ScanModeV5 } from "@/lib/scan-schema-v5-types";
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
  "priceAlertPending": boolean,
  "confidenceScore": number
}
"confidenceScore" MUST be a number between 0.0 and 1.0 reflecting how clearly you could read and extract this document: 1.0 = perfectly legible and fully extracted, 0.5 = partially blurry/ambiguous, below 0.3 = mostly unreadable. Be honest — this drives the UI certainty indicator.`;

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

