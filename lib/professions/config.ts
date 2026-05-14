import React from "react";
import { 
  Scale, Stethoscope, Building2, Calculator, 
  ShoppingCart, HardHat, FileText, Bot, 
  Briefcase, Landmark, ShieldCheck, Home, Gavel
} from "lucide-react";

/**
 * 🚀 BSD-YBM: MODULAR INDUSTRY CONFIGURATION SYSTEM
 * Central source of truth for all profession-based behavior.
 */

export type IndustryType = 
  | "GENERAL" 
  | "LEGAL" 
  | "ACCOUNTING" 
  | "CONSTRUCTION" 
  | "MEDICAL" 
  | "RETAIL" 
  | "REAL_ESTATE";

const INDUSTRY_ALIASES: Record<string, IndustryType> = {
  GENERAL: "GENERAL",
  LAWYER: "LEGAL",
  LEGAL: "LEGAL",
  ACCOUNTANT: "ACCOUNTING",
  ACCOUNTING: "ACCOUNTING",
  CONTRACTOR: "CONSTRUCTION",
  CONSTRUCTION: "CONSTRUCTION",
  HEALTH: "MEDICAL",
  MEDICAL: "MEDICAL",
  RETAIL: "RETAIL",
  REAL_ESTATE: "REAL_ESTATE",
};

export interface AnalysisType {
  id: string;
  label: string;
  description: string;
  promptExtra?: string; 
}

export interface IndustryConfig {
  id: IndustryType;
  label: string;
  iconName: string; // For Lucide lookup if needed
  icon?: React.ReactNode;
  vocabulary: {
    client: string;
    project: string;
    document: string;
    inventory?: string;
  };
  features: {
    hasCrm: boolean;
    hasErp: boolean;
    hasInventory: boolean;
    hasFleet: boolean;
    hasLegalVault?: boolean;
    hasConstructionPlan?: boolean;
  };
  /** Scanner Specifics */
  scanner: {
    title: string;
    subtitle: string;
    dropzoneTitle: string;
    dropzoneSub: string;
    analysisTypes: AnalysisType[];
    resultColumns: { key: string; label: string }[];
  };
  aiInstructions: string;
}

export const INDUSTRY_CONFIGS: Record<IndustryType, IndustryConfig> = {
  GENERAL: {
    id: "GENERAL",
    label: "ניהול כללי",
    iconName: "Building2",
    vocabulary: { client: "לקוח", project: "פרויקט", document: "מסמך", inventory: "מלאי" },
    features: { hasCrm: true, hasErp: true, hasInventory: true, hasFleet: false },
    scanner: {
      title: "אשף סריקה ובקרה (Vision AI)",
      subtitle: "תהליך חכם לסריקת חשבוניות, פירוק נתונים אוטומטי ושיוך למערך התשלומים וה-CRM",
      dropzoneTitle: "גרור מסמכים לכאן",
      dropzoneSub: "תמיכה ב-PDF, JPG, PNG",
      analysisTypes: [
        { id: "INVOICE", label: "חשבונית מס", description: "פירוק ספקי שירות, מע״מ וסה״כ לתשלום" },
        { id: "RECEIPT", label: "קבלה", description: "אישור תשלום עבור הוצאות מוכרות" }
      ],
      resultColumns: [
        { key: "vendor", label: "ספק" },
        { key: "total", label: "סה״כ" },
        { key: "date", label: "תאריך" }
      ]
    },
    aiInstructions: "Analyze this document for standard corporate accounting."
  },
  LEGAL: {
    id: "LEGAL",
    label: "משרד עורכי דין",
    iconName: "Gavel",
    vocabulary: { client: "לקוח / מיוצג", project: "תיק משפטי", document: "כתב בית-דין / נספח", inventory: "ספרייה" },
    features: { hasCrm: true, hasErp: true, hasInventory: false, hasFleet: false, hasLegalVault: true },
    scanner: {
      title: "מרכז בקרת מסמכים משפטיים",
      subtitle: "סריקה חכמה של כתבי טענות, חוזים ופרוטוקולים באמצעות AI מבוסס פסיקה",
      dropzoneTitle: "גרור כתבי טענות או חוזים",
      dropzoneSub: "סריקה מאובטחת ומסווגת",
      analysisTypes: [
        { id: "LEGAL_CONTRACT", label: "ניתוח חוזה", description: "זיהוי סעיפי הפרה, שיפוי ותקופת התקשרות", promptExtra: "Focus on indemnification and liability." },
        { id: "COURT_DOC", label: "כתב טענות", description: "סיכום טענות עיקריות, מועדי הגשה וסעדים מבוקשים" }
      ],
      resultColumns: [
        { key: "party_names", label: "צדדים" },
        { key: "case_number", label: "מס' תיק" },
        { key: "critical_date", label: "מועד קריטי" }
      ]
    },
    aiInstructions: "Analyze for legal metadata and case information."
  },
  ACCOUNTING: {
    id: "ACCOUNTING",
    label: "ראיית חשבון / ייעוץ מס",
    iconName: "Calculator",
    vocabulary: { client: "נישום / לקוח", project: "ביקורת / דוח", document: "מסמך חשבונאי", inventory: "ארכיון" },
    features: { hasCrm: true, hasErp: true, hasInventory: false, hasFleet: false },
    scanner: {
      title: "סורק ביקורת וחשבונאות מתקדם",
      subtitle: "פירוק אוטומטי של חבילות חשבוניות לממשקי פקודות יומן",
      dropzoneTitle: "גרור חבילות חשבוניות לביקורת",
      dropzoneSub: "סיווג אוטומטי לסעיפי מאזן",
      analysisTypes: [
        { id: "TAX_INVOICE_FULL", label: "חשבונית מס (פירוט מלא)", description: "חילוץ שורה-שורה כולל סיווג הוצאה", promptExtra: "Extract every line item separately." },
        { id: "BANK_STATEMENT", label: "תדפיס בנק", description: "המרה של תדפיסי בנק לפורמט אקסל/CSV לביקורת" }
      ],
      resultColumns: [
        { key: "tax_id", label: "ח״פ ספק" },
        { key: "vat_total", label: "מע״מ" },
        { key: "account_code", label: "קוד הנה״ח" }
      ]
    },
    aiInstructions: "Focus on Israeli tax forms and detailed bookkeeping."
  },
  CONSTRUCTION: {
    id: "CONSTRUCTION",
    label: "קבלנות / בנייה / שיפוצים",
    iconName: "HardHat",
    vocabulary: { client: "יזם / לקוח", project: "אתר עבודה / פרויקט", document: "כתב כמויות / חשבונית חומרים", inventory: "ציוד וכלי עבודה" },
    features: { hasCrm: true, hasErp: true, hasInventory: true, hasFleet: true, hasConstructionPlan: true },
    scanner: {
      title: "מפקח בנייה דיגיטלי (AI Scanner)",
      subtitle: "פענוח חשבוניות ספקים, חוזים, יומני עבודה ואישורי מהנדס לקבלנים",
      dropzoneTitle: "גרור מסמכים, תכניות, הזמנות, או תעודות משלוח",
      dropzoneSub: "AI מפענח נתונים אוטומטית בהתאם לסוג המסמך",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית מס ספק", description: "רכש חומרים, בטון, ברזל - חילוץ כמויות ומחירים" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח / שקילה", description: "תעודות בטון, משקל ברזל, חומרי בניין" },
        { id: "SITE_LOG", label: "יומן עבודה / כוח אדם", description: "סיכום פעילות יומית, קבלני משנה וכוח אדם" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות (BOQ)", description: "פירוט שלבים, מחירים ואומדנים לפרויקט" },
        { id: "ENGINEER_APPROVAL", label: "אישור מהנדס / יועץ", description: "תעודת בדיקת בטיחות, אישור יציקה, קונסטרוקציה" },
        { id: "SUBCONTRACTOR_BILL", label: "חשבון קבלן משנה", description: "חילוץ סעיפי ביצוע, התחשבנות ומקדמות" },
        { id: "CONTRACT_AGREEMENT", label: "חוזה ביצוע", description: "עיקרי חוזה מול יזם או מזמין עבודה" }
      ],
      resultColumns: [
        { key: "project_site", label: "אתר עבודה / פרויקט" },
        { key: "doc_type", label: "סוג מסמך" },
        { key: "material_or_service", label: "חומר / שירות" },
        { key: "total_amount", label: "סכום / כמות" },
        { key: "approval_status", label: "סטטוס אישור" }
      ]
    },
    aiInstructions: "Analyze for materials, quantities, billing amounts, contractor names, and site management data in Israeli construction contexts."
  },
  MEDICAL: {
    id: "MEDICAL",
    label: "רפואה / טיפול / קליניקה",
    iconName: "Stethoscope",
    vocabulary: { client: "מטופל / פציינט", project: "סדרת טיפולים", document: "תיק רפואי / מרשם", inventory: "מלאי תרופות/ציוד" },
    features: { hasCrm: true, hasErp: true, hasInventory: true, hasFleet: false },
    scanner: {
      title: "מפענח רשומות רפואיות AI",
      subtitle: "סריקת תוצאות מעבדה, מרשמים והפניות בדיוק קליני גבוה",
      dropzoneTitle: "גרור תוצאות בדיקה או מרשמים",
      dropzoneSub: "תואם תקני אבטחת מידע רפואי",
      analysisTypes: [
        { id: "LAB_RESULT", label: "פענוח מעבדה", description: "זיהוי ערכים חריגים וסיכום מגמות", promptExtra: "Highlight out-of-range values." },
        { id: "PRESCRIPTION", label: "קריאת מרשם", description: "מינון וזיהוי תרופות אוטומטי" }
      ],
      resultColumns: [
        { key: "patient_name", label: "מטופל" },
        { key: "clinical_finding", label: "ממצא עיקרי" },
        { key: "urgency", label: "דחיפות" }
      ]
    },
    aiInstructions: "Strict HIPAA-like focus on clinical data and patient privacy."
  },
  RETAIL: {
    id: "RETAIL",
    label: "חנות / מסחר / קמעונאות",
    iconName: "ShoppingCart",
    vocabulary: { client: "לקוח קצה", project: "ספק / הזמנה", document: "תעודת משלוח / חשבונית רכש", inventory: "מדפי חנות / מחסן" },
    features: { hasCrm: true, hasErp: true, hasInventory: true, hasFleet: false },
    scanner: {
      title: "מרכז ניהול מלאי וספקים",
      subtitle: "סריקת תעודות משלוח וחשבוניות מלאי לצורך עדכון מחסן",
      dropzoneTitle: "גרור תעודות משלוח או חשבוניות מלאי",
      dropzoneSub: "עדכון קטלוג מוצרים בזמן אמת",
      analysisTypes: [
        { id: "DELIVERY_NOTE", label: "תעודת משלוח", description: "זיהוי פריטים שהגיעו למחסן" },
        { id: "INVOICE_RETAIL", label: "חשבונית רכש", description: "עדכון עלות מלאי וספקים" }
      ],
      resultColumns: [
        { key: "sku_count", label: "כמות פריטים" },
        { key: "total_cost", label: "עלות רכש" },
        { key: "supplier", label: "ספק" }
      ]
    },
    aiInstructions: "Extract SKUs, quantities, and unit costs for inventory update."
  },
  REAL_ESTATE: {
    id: "REAL_ESTATE",
    label: "נדל\"ן / תיווך",
    iconName: "Home",
    vocabulary: { client: "קונה / שוכר", project: "נכס / דירה", document: "חוזה / נסח טאבו", inventory: "מאגר נכסים" },
    features: { hasCrm: true, hasErp: true, hasInventory: false, hasFleet: false },
    scanner: {
      title: "אשף נדל״ן וטאבו חכם",
      subtitle: "סריקת נסחי טאבו, הסכמי מכר ותוכניות בנייה בזמן אמת",
      dropzoneTitle: "גרור נסחי טאבו או הסכמי מכר",
      dropzoneSub: "זיהוי גוש/חלקה אוטומטי",
      analysisTypes: [
        { id: "TABU_EXTRACT", label: "ניתוח נסח טאבו", description: "חילוץ בעלות והערות אזהרה", promptExtra: "Identify current owners and warnings." },
        { id: "SALES_AGREEMENT", label: "הסכם מכר", description: "זיהוי לוח תשלומים ומועדי מסירה" }
      ],
      resultColumns: [
        { key: "block_parcel", label: "גוש/חלקה" },
        { key: "owner_name", label: "בעלים" },
        { key: "sq_meters", label: "שטח (מ״ר)" }
      ]
    },
    aiInstructions: "Analyze property documents for ownership and legal status."
  }
};

export function normalizeIndustryType(id?: string | null): IndustryType {
  const normalized = String(id ?? "GENERAL").trim().toUpperCase();
  return INDUSTRY_ALIASES[normalized] ?? "GENERAL";
}

export function getIndustryConfig(id?: string): IndustryConfig {
  const normalized = normalizeIndustryType(id);
  return INDUSTRY_CONFIGS[normalized] || INDUSTRY_CONFIGS.GENERAL;
}
