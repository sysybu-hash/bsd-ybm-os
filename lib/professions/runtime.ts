import { getIndustryConfig, type IndustryType } from "@/lib/professions/config";
import type { MessageTree } from "@/lib/i18n/keys";
import {
  mergeConstructionTradeLabel,
  mergeTradeProfileFromMessages,
} from "@/lib/construction-trades-i18n";
import {
  constructionTradeLabelHe,
  getConstructionTradeProfileOverlay,
  getMergedIndustryConfig,
  normalizeConstructionTrade,
  type ConstructionTradeId,
} from "@/lib/construction-trades";

export type ProfessionalTemplateKind = "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
export type OfficialIssuedDocumentType = "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";

export type ProfessionalDocumentTemplate = {
  id: string;
  label: string;
  description: string;
  kind: ProfessionalTemplateKind;
  issuedDocumentType?: OfficialIssuedDocumentType;
};

type IndustryProfileBase = {
  clientsLabel: string;
  documentsLabel: string;
  recordsLabel: string;
  /** תווית טאב ERP/כספים — כשלא מוגדר משתמשים ב-documentsLabel */
  financeNavLabel?: string;
  homeTitle: string;
  homeDescription: string;
  templates: ProfessionalDocumentTemplate[];
};

export type IndustryProfile = IndustryProfileBase & {
  id: IndustryType;
  industryLabel: string;
  vocabulary: {
    client: string;
    project: string;
    document: string;
  };
  analysisTypes: Array<{
    id: string;
    label: string;
    description: string;
  }>;
  /** מזהה התמחות בענף הבנייה — כשלא רלוונטי undefined */
  constructionTradeId?: ConstructionTradeId;
  constructionTradeLabel?: string;
};

type IndustryOverrides = {
  customLabels?: Partial<{
    clients: string;
    documents: string;
    records: string;
    client: string;
    project: string;
    document: string;
  }>;
};

const INDUSTRY_PROFILES: Record<IndustryType, IndustryProfileBase> = {
  GENERAL: {
    clientsLabel: "לקוחות",
    documentsLabel: "מסמכים",
    recordsLabel: "מסמכים ואישורים",
    homeTitle: "מרכז עבודה אחד לכל התהליך העסקי.",
    homeDescription: "כל לקוח, מסמך וחיוב מסתנכרנים למסך עבודה ברור שמכוון לעסק כללי או רב-תחומי.",
    templates: [
      { id: "INVOICE", label: "חשבונית מס", description: "מסמך חיוב רשמי ללקוח.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
      { id: "RECEIPT", label: "קבלה", description: "אישור תשלום רשמי.", kind: "OFFICIAL", issuedDocumentType: "RECEIPT" },
      { id: "SERVICE_REPORT", label: "דוח שירות", description: "סיכום ביצוע או טיפול פנימי.", kind: "REPORT" },
      { id: "WORK_APPROVAL", label: "אישור ביצוע", description: "אישור פנימי או מול לקוח על סיום משימה.", kind: "APPROVAL" },
    ],
  },
  LEGAL: {
    clientsLabel: "מיוצגים ותיקים",
    documentsLabel: "תיקים ומסמכים",
    recordsLabel: "מסמכים משפטיים ואישורים",
    homeTitle: "מרחב עבודה שמדבר שפה משפטית.",
    homeDescription: "התפריטים, הכותרות והמסמכים מותאמים לניהול מיוצגים, תיקים, חוזים ואישורים משפטיים.",
    templates: [
      { id: "ENGAGEMENT_AGREEMENT", label: "הסכם ייצוג", description: "מסמך פתיחת תיק והתקשרות עם לקוח.", kind: "FORM" },
      { id: "COURT_FILING_APPROVAL", label: "אישור הגשה לבית משפט", description: "אישור פנימי/חיצוני להגשת מסמך משפטי.", kind: "APPROVAL" },
      { id: "CASE_SUMMARY", label: "סיכום תיק", description: "דוח מצב תיק, מועדים וסיכונים.", kind: "REPORT" },
      { id: "INVOICE", label: "חשבונית שכר טרחה", description: "חיוב רשמי על שירות משפטי.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  ACCOUNTING: {
    clientsLabel: "לקוחות מס וביקורת",
    documentsLabel: "דוחות ומסמכי חשבונאות",
    recordsLabel: "דוחות, מסמכים ואישורי מס",
    homeTitle: "מערכת שמותאמת למשרד חשבונאות פעיל.",
    homeDescription: "המסכים וה-AI בנויים לנישומים, דוחות, ביקורות ואישורי מס במקום מונחים כלליים.",
    templates: [
      { id: "BOOKKEEPING_REPORT", label: "סיכום הנהלת חשבונות", description: "סיכום חודשי או תקופתי ללקוח.", kind: "REPORT" },
      { id: "TAX_APPROVAL", label: "אישור מס", description: "אישור הגשה, תיאום או בקרה ללקוח.", kind: "APPROVAL" },
      { id: "AUDIT_MEMO", label: "מזכר ביקורת", description: "סיכום ממצאים ופעולות מתקנות.", kind: "REPORT" },
      { id: "INVOICE", label: "חשבונית שירותי הנהלת חשבונות", description: "חיוב רשמי עבור שירותי המשרד.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  CONSTRUCTION: {
    clientsLabel: "פרויקטים",
    documentsLabel: "יומנים, תוכניות ומסמכי שטח",
    financeNavLabel: "כספים",
    recordsLabel: "אישורי שטח ומסמכי פרויקט",
    homeTitle: "מרחב עבודה לפרויקטים, אישורי שטח וחומרי בנייה.",
    homeDescription: "הממשק משנה שפה לניהול אתרים, אישורי ביצוע, יומני עבודה וחומרי גלם.",
    templates: [
      { id: "SITE_LOG", label: "יומן עבודה", description: "דיווח יומי על צוות, חומרים והתקדמות.", kind: "REPORT" },
      { id: "MATERIAL_APPROVAL", label: "אישור חומר/אספקה", description: "אישור קבלה או שימוש בחומרי בנייה.", kind: "APPROVAL" },
      { id: "WORK_COMPLETION", label: "אישור סיום שלב", description: "אישור מסירה או סיום שלב לפרויקט.", kind: "APPROVAL" },
      { id: "INVOICE", label: "חשבונית קבלן", description: "חיוב רשמי עבור עבודות או שלבים.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  MEDICAL: {
    clientsLabel: "מטופלים ותיקים קליניים",
    documentsLabel: "תיקי טיפול ומסמכים רפואיים",
    recordsLabel: "טפסי טיפול, אישורים וסיכומים",
    homeTitle: "מרכז עבודה שמדבר קליניקה ולא רק CRM.",
    homeDescription: "כותרות, מסמכים ופענוחי AI מותאמים למטופלים, טיפולים, מרשמים ואישורי טיפול.",
    templates: [
      { id: "CONSENT_FORM", label: "טופס הסכמה", description: "אישור חתום או פנימי לפני טיפול.", kind: "APPROVAL" },
      { id: "TREATMENT_SUMMARY", label: "סיכום טיפול", description: "דוח מהלך טיפול והמלצות להמשך.", kind: "REPORT" },
      { id: "REFERRAL_APPROVAL", label: "אישור הפניה", description: "אישור או תיעוד להפניה חיצונית.", kind: "APPROVAL" },
      { id: "RECEIPT", label: "קבלה על טיפול", description: "אישור תשלום רשמי למטופל.", kind: "OFFICIAL", issuedDocumentType: "RECEIPT" },
    ],
  },
  RETAIL: {
    clientsLabel: "לקוחות, ספקים ומלאי",
    documentsLabel: "מסמכי מלאי וסחר",
    recordsLabel: "אישורי מלאי ומסמכי אספקה",
    homeTitle: "ניהול מסחר ומלאי מתוך מסך עבודה אחד.",
    homeDescription: "המערכת מתאימה את השפה להזמנות, אספקות, מלאי וספקים במקום מונחים כלליים.",
    templates: [
      { id: "DELIVERY_CONFIRMATION", label: "אישור אספקה", description: "תיעוד קבלה או מסירה של מלאי.", kind: "APPROVAL" },
      { id: "INVENTORY_REPORT", label: "דוח פערי מלאי", description: "סיכום חריגות, חוסרים ועדכון מדפים.", kind: "REPORT" },
      { id: "PURCHASE_ORDER", label: "הזמנת רכש", description: "מסמך פנימי או חיצוני להזמנה מספק.", kind: "FORM" },
      { id: "INVOICE", label: "חשבונית רכש/מכירה", description: "חיוב רשמי מול ספק או לקוח.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
  REAL_ESTATE: {
    clientsLabel: "קונים, שוכרים ונכסים",
    documentsLabel: "נכסים, חוזים ומסמכים",
    recordsLabel: "אישורי נכס ודוחות תיווך",
    homeTitle: "מרחב עבודה שמכוון לנכסים, עסקאות ואישורים.",
    homeDescription: "המערכת מחליפה שפה כללית בשפה של נכסים, עסקאות, שוכרים ואישורי מסירה.",
    templates: [
      { id: "PROPERTY_SUMMARY", label: "סיכום נכס", description: "סיכום נתוני נכס, בעלות וסטטוס.", kind: "REPORT" },
      { id: "TENANCY_APPROVAL", label: "אישור שכירות", description: "אישור תהליך שכירות, מסירה או חידוש.", kind: "APPROVAL" },
      { id: "VIEWING_REPORT", label: "דוח פגישה בנכס", description: "תיעוד סיור, פגישה או סטטוס עסקה.", kind: "REPORT" },
      { id: "INVOICE", label: "חשבונית תיווך/ניהול", description: "חיוב רשמי על שירותי תיווך או ניהול.", kind: "OFFICIAL", issuedDocumentType: "INVOICE" },
    ],
  },
};

function readOverrides(raw: unknown): IndustryOverrides {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return {};
  }
  const value = raw as Record<string, unknown>;
  const customLabelsRaw = value.customLabels;
  if (typeof customLabelsRaw !== "object" || customLabelsRaw === null || Array.isArray(customLabelsRaw)) {
    return {};
  }
  return {
    customLabels: customLabelsRaw as IndustryOverrides["customLabels"],
  };
}

function readString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function pickMessageString(messages: MessageTree | undefined, key: string): string | undefined {
  if (!messages) return undefined;
  const parts = key.split(".");
  let cur: unknown = messages as unknown;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return typeof cur === "string" && cur.trim() ? cur.trim() : undefined;
}

export function getIndustryProfile(
  industryId?: string,
  rawConfig?: unknown,
  constructionTrade?: string | null,
  localeMessages?: MessageTree | null,
): IndustryProfile {
  const config = getIndustryConfig(industryId);
  const merged = getMergedIndustryConfig(industryId, constructionTrade, localeMessages ?? undefined);
  const profile = INDUSTRY_PROFILES[config.id];
  const overrides = readOverrides(rawConfig);
  const customLabels = overrides.customLabels ?? {};
  const tradeId = normalizeConstructionTrade(constructionTrade);
  const tradeLabelHe = constructionTradeLabelHe(tradeId);
  const tradeLabel = mergeConstructionTradeLabel(localeMessages ?? undefined, tradeId, tradeLabelHe);
  let tradeProfile =
    config.id === "CONSTRUCTION" ? getConstructionTradeProfileOverlay(constructionTrade) : null;
  if (localeMessages && tradeProfile) {
    tradeProfile = mergeTradeProfileFromMessages(localeMessages, tradeId, tradeProfile);
  }

  const baseIndustryLabel = pickMessageString(localeMessages ?? undefined, `professions.${config.id}.label`) ?? config.label;
  const industryLabel =
    config.id === "CONSTRUCTION" ? `${baseIndustryLabel} · ${tradeLabel}` : baseIndustryLabel;

  const clientsBase = tradeProfile?.clientsLabel ?? profile.clientsLabel;
  const documentsBase = tradeProfile?.documentsLabel ?? profile.documentsLabel;
  const recordsBase = tradeProfile?.recordsLabel ?? profile.recordsLabel;
  const homeTitleBase = tradeProfile?.homeTitle ?? profile.homeTitle;
  const homeDescriptionBase = tradeProfile?.homeDescription ?? profile.homeDescription;
  const templatesBase = tradeProfile?.templates ?? profile.templates;

  return {
    id: config.id,
    industryLabel,
    clientsLabel: readString(customLabels.clients, clientsBase),
    documentsLabel: readString(customLabels.documents, documentsBase),
    financeNavLabel: profile.financeNavLabel,
    recordsLabel: readString(customLabels.records, recordsBase),
    homeTitle: homeTitleBase,
    homeDescription: homeDescriptionBase,
    vocabulary: {
      client: readString(customLabels.client, merged.vocabulary.client),
      project: readString(customLabels.project, merged.vocabulary.project),
      document: readString(customLabels.document, merged.vocabulary.document),
    },
    analysisTypes: merged.scanner.analysisTypes,
    templates: templatesBase as IndustryProfileBase["templates"],
    constructionTradeId: config.id === "CONSTRUCTION" ? tradeId : undefined,
    constructionTradeLabel: config.id === "CONSTRUCTION" ? tradeLabel : undefined,
  };
}
