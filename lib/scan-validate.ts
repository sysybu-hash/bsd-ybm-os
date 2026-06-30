/**
 * אימות תוצאת פענוח (V5) — בדיקות sanity דטרמיניסטיות על המידע שחזר מה-AI.
 *
 * שלב 3 באפיון הסריקה: לאחר פענוח, מריצים בדיקות לוגיות (סכום שורות = סה"כ,
 * ח"פ תקין, תאריך הגיוני, יחס מע"מ סביר). הבעיות שנמצאות:
 *   1. מוצגות למשתמש כאזהרות (field-level)
 *   2. משמשות בסיס ל-retry ממוקד אל ה-AI ("הסכום לא מסתדר — בדוק שוב")
 *
 * המודול טהור (ללא תלות ב-AI/DB) — קל לבדיקה ולשימוש חוזר.
 */
import {
  clampConfidenceScore,
  DEFAULT_CONFIDENCE_SCORE,
  type ScanExtractionV5,
} from "@/lib/scan-schema-v5";
import { isPlaceholderVendor } from "@/lib/scan/v5-normalize";

/** מתחת לסף זה (ביטחון משוקלל) — הסריקה מנותבת לסקירה אנושית לפני שמירה. */
export const REVIEW_CONFIDENCE_THRESHOLD = 0.6;

export type ValidationSeverity = "error" | "warning" | "info";

export type ValidationIssue = {
  /** מזהה השדה הרלוונטי (לסימון ב-UI): "total", "taxId", "date", "lineItems", ... */
  field: string;
  severity: ValidationSeverity;
  /** הודעה קריאה למשתמש (עברית) */
  message: string;
  /** קוד יציב ל-retry / טלמטריה */
  code: string;
};

export type ScanValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  /** ציון ביטחון מחושב 0..1 — יורד עם כל בעיה */
  confidence: number;
  /** ביטחון משוקלל: המינימום בין ביטחון-הולידציה לביטחון העצמי של המודל */
  effectiveConfidence: number;
  /** האם לנתב לסקירה אנושית לפני שמירה (ביטחון נמוך או שגיאת error) */
  requiresHumanReview: boolean;
  /** ביטחון פר-שדה (0..1) לשדות שסומנו בבעיה — להצגת נקודות סטטוס ב-UI */
  fieldConfidence: Record<string, number>;
};

/** ביטחון פר-שדה לפי חומרת הבעיה החמורה ביותר שסומנה עליו. */
function severityConfidence(severity: ValidationSeverity): number {
  return severity === "error" ? 0.3 : severity === "warning" ? 0.6 : 0.85;
}

/** מע"מ ישראלי נכון ל-2026 (אחרי 1.1.2026: 18%). טווח סובלנות לזיהוי. */
const VAT_RATE = 0.18;
const AMOUNT_TOLERANCE = 0.02; // 2% סטייה מותרת בין סכום שורות לסה"כ

/**
 * אימות מספר עוסק/ח"פ ישראלי (9 ספרות) — אלגוריתם ספרת ביקורת (Luhn-like, משקל מתחלף).
 * זהה לאימות ת"ז ישראלית.
 */
export function isValidIsraeliTaxId(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 9) return false;
  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    let n = Number(digits[i]) * ((i % 2) + 1);
    if (n > 9) n -= 9;
    sum += n;
  }
  return sum % 10 === 0;
}

/** תאריך ISO תקין ובטווח הגיוני (לא עתידי מדי, לא לפני 1990) */
function isPlausibleDate(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const year = d.getFullYear();
  const nextYear = new Date().getFullYear() + 1;
  return year >= 1990 && year <= nextYear;
}

function sumLineTotals(v5: ScanExtractionV5): number {
  return v5.lineItems.reduce((acc, li) => {
    const lt =
      typeof li.lineTotal === "number" && Number.isFinite(li.lineTotal)
        ? li.lineTotal
        : typeof li.unitPrice === "number" && typeof li.quantity === "number"
          ? li.unitPrice * li.quantity
          : 0;
    return acc + (Number.isFinite(lt) ? lt : 0);
  }, 0);
}

/**
 * מריץ את כל בדיקות ה-sanity על תוצאת פענוח.
 * הבדיקות הפיננסיות חלות רק על מסמכים פיננסיים (INVOICE_FINANCIAL / PROGRESS_BILL).
 */
export function validateScanV5(v5: ScanExtractionV5): ScanValidationResult {
  const issues: ValidationIssue[] = [];
  const isFinancial =
    v5.documentMetadata.scanMode === "INVOICE_FINANCIAL" ||
    v5.documentMetadata.scanMode === "PROGRESS_BILL";

  // ── ספק חסר ─────────────────────────────────────────────────────────────
  if (!v5.vendor || isPlaceholderVendor(v5.vendor)) {
    issues.push({
      field: "vendor",
      severity: "warning",
      code: "vendor_missing",
      message: "שם הספק לא זוהה — מומלץ להשלים ידנית.",
    });
  }

  // ── ח"פ / ע.מ לא תקין ───────────────────────────────────────────────────
  if (v5.taxId && !isValidIsraeliTaxId(v5.taxId)) {
    issues.push({
      field: "taxId",
      severity: "warning",
      code: "taxid_invalid_checksum",
      message: `מספר העוסק/ח"פ (${v5.taxId}) נכשל בבדיקת ספרת ביקורת — ייתכן שגיאת פענוח.`,
    });
  }

  // ── תאריך לא הגיוני ─────────────────────────────────────────────────────
  if (v5.date && !isPlausibleDate(v5.date)) {
    issues.push({
      field: "date",
      severity: "warning",
      code: "date_implausible",
      message: `התאריך (${v5.date}) אינו תקין או חורג מטווח הגיוני.`,
    });
  }

  if (isFinancial) {
    // ── סה"כ לא חיובי ─────────────────────────────────────────────────────
    if (!Number.isFinite(v5.total) || v5.total <= 0) {
      issues.push({
        field: "total",
        severity: "error",
        code: "total_missing",
        message: "סכום כולל (total) חסר או אינו חיובי.",
      });
    }

    // ── סכום שורות לא תואם לסה"כ ───────────────────────────────────────────
    const lineSum = sumLineTotals(v5);
    if (v5.lineItems.length > 0 && lineSum > 0 && v5.total > 0) {
      const diff = Math.abs(lineSum - v5.total);
      const withinExc = diff <= v5.total * AMOUNT_TOLERANCE;
      const withinVat = Math.abs(lineSum * (1 + VAT_RATE) - v5.total) <= v5.total * AMOUNT_TOLERANCE;
      if (!withinExc && !withinVat) {
        issues.push({
          field: "lineItems",
          severity: "warning",
          code: "line_sum_mismatch",
          message: `סכום השורות (${lineSum.toFixed(2)}) אינו תואם לסה"כ (${v5.total.toFixed(2)}), גם לא בתוספת מע"מ.`,
        });
      }
    }

    // ── שורה ללא מחיר ─────────────────────────────────────────────────────
    if (v5.priceAlertPending) {
      issues.push({
        field: "lineItems",
        severity: "info",
        code: "price_alert_pending",
        message: "חלק מהשורות ללא מחיר יחידה — מומלץ להשלים.",
      });
    }
  }

  // ── ציון ביטחון: 1.0 פחות עונש לכל בעיה לפי חומרה ─────────────────────────
  const penalty = issues.reduce((acc, i) => {
    return acc + (i.severity === "error" ? 0.3 : i.severity === "warning" ? 0.15 : 0.05);
  }, 0);
  const confidence = Math.max(0, Math.min(1, 1 - penalty));

  // ── ביטחון משוקלל + ניתוב לסקירה אנושית (P0.4) ───────────────────────────
  // משלבים את ביטחון-הולידציה הדטרמיניסטי עם הביטחון העצמי של המודל; הנמוך מנצח.
  const modelConfidence = clampConfidenceScore(v5.confidenceScore) ?? DEFAULT_CONFIDENCE_SCORE;
  const effectiveConfidence = Math.min(confidence, modelConfidence);
  const hasError = issues.some((i) => i.severity === "error");
  const requiresHumanReview = hasError || effectiveConfidence < REVIEW_CONFIDENCE_THRESHOLD;

  // ביטחון פר-שדה: שדה שסומן בבעיה מקבל ביטחון לפי החומרה החמורה ביותר עליו.
  const fieldConfidence: Record<string, number> = {};
  for (const issue of issues) {
    const c = severityConfidence(issue.severity);
    const prev = fieldConfidence[issue.field];
    fieldConfidence[issue.field] = prev === undefined ? c : Math.min(prev, c);
  }

  return {
    ok: !hasError,
    issues,
    confidence,
    effectiveConfidence,
    requiresHumanReview,
    fieldConfidence,
  };
}

/**
 * בונה הנחיית retry ממוקדת ל-AI על בסיס הבעיות שנמצאו.
 * מוחזר טקסט שמתווסף ל-userInstruction בסבב הפענוח השני.
 */
export function buildRetryInstruction(issues: ValidationIssue[]): string {
  if (!issues.length) return "";
  const lines = issues
    .filter((i) => i.severity !== "info")
    .map((i) => `- [${i.field}] ${i.message}`);
  if (!lines.length) return "";
  return [
    "### VALIDATION FEEDBACK — your previous extraction had issues. Re-examine the document carefully and FIX these:",
    ...lines,
    "Pay special attention to numeric accuracy: line item totals should sum to the document total (with or without VAT), and the Israeli tax ID must be a valid 9-digit number.",
  ].join("\n");
}
