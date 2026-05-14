import {
  mergeAnalysisTypesFromMessages,
  mergeResultColumnsFromMessages,
  mergeScannerShellFromMessages,
  mergeTradeVocabularyFromMessages,
} from "@/lib/construction-trades-i18n";
import type { MessageTree } from "@/lib/i18n/keys";
import {
  INDUSTRY_CONFIGS,
  normalizeIndustryType,
  type IndustryConfig,
  type IndustryType,
} from "@/lib/professions/config";

export const CONSTRUCTION_TRADE_IDS = [
  "GENERAL_CONTRACTOR",
  "ELECTRICAL",
  "PLUMBING",
  "HVAC",
  "PAINTING",
  "FLOORING",
  "ALUMINUM",
  "FINISHING",
  "LANDSCAPING",
  "SUBCONTRACTOR_OTHER",
] as const;

export type ConstructionTradeId = (typeof CONSTRUCTION_TRADE_IDS)[number];

const LABELS_HE: Record<ConstructionTradeId, string> = {
  GENERAL_CONTRACTOR: "קבלן ראשי / ליווי פרויקט",
  ELECTRICAL: "חשמלאי / עבודות חשמל",
  PLUMBING: "אינסטלציה ותברואה",
  HVAC: "מיזוג אוויר",
  PAINTING: "צבע, טיח ושליכט",
  FLOORING: "ריצוף, אבן וקרמיקה",
  ALUMINUM: "אלומיניום וזכוכית",
  FINISHING: "גמר פנים (דלתות, מטבח…)",
  LANDSCAPING: "גינון קשיח / חוץ",
  SUBCONTRACTOR_OTHER: "קבלן משנה / אחר",
};

/** תבניות הנפקה / אישורים — מזהים חופשיים לתצוגה (אין אכיפת enum בצד שרת) */
export type TradeIssueTemplate = {
  id: string;
  label: string;
  description: string;
  kind: "OFFICIAL" | "APPROVAL" | "FORM" | "REPORT";
  issuedDocumentType?: "INVOICE" | "RECEIPT" | "INVOICE_RECEIPT" | "CREDIT_NOTE";
};

/** התאמת סורק, AI, אוצר מילים ותוכן מסכים לפי מקצוע בנייה */
type ConstructionTradePatch = {
  scanner: Partial<IndustryConfig["scanner"]> & {
    analysisTypes?: IndustryConfig["scanner"]["analysisTypes"];
    resultColumns?: IndustryConfig["scanner"]["resultColumns"];
  };
  aiInstructionsSuffix?: string;
  vocabulary?: Partial<IndustryConfig["vocabulary"]>;
  profile?: {
    clientsLabel: string;
    documentsLabel: string;
    recordsLabel: string;
    homeTitle: string;
    homeDescription: string;
    templates: TradeIssueTemplate[];
  };
};

const TRADE_PATCHES: Record<ConstructionTradeId, ConstructionTradePatch | null> = {
  GENERAL_CONTRACTOR: null,
  ELECTRICAL: {
    scanner: {
      title: "פענוח מסמכי חשמל ושטח",
      subtitle: "תעודות בדיקה, הזמנות חומר, חשבוניות ספק — בהקשר חשמלאי",
      dropzoneTitle: "העלה תעודות בדיקה, חשבוניות או הזמנות חומר",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש כבלים, לוחות, תאורה ואביזרים" },
        { id: "MATERIAL_ORDER", label: "הזמנת חומרים / הצעת מחיר", description: "השוואת כמויות ומחירי ציוד חשמל" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ציוד", description: "וידוא קבלת אביזרים וארונות חשמל באתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "סיכום יומי של צוותי חשמל, שעות והתקדמות" },
        { id: "ELECTRICAL_TEST_CERT", label: "תעודת בדיקה (בודק/חברת חשמל)", description: "זיהוי תקן, תאריך בדיקה, רג'קטים" },
        { id: "APPROVAL_CERT", label: "אישור התקנה / מסירה", description: "אישור עבודות הארקה, מיתוג ולוחות חשמל" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות חשמל", description: "סעיפי ביצוע, אומדן מחירי נקודות ותשתיות" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "site_or_panel", label: "אתר / לוח" },
        { key: "total_items", label: "כמות / היקף" },
        { key: "standard_ref", label: "תקן / אישור" },
        { key: "approval_status", label: "סטטוס מסמך" },
      ],
    },
    aiInstructionsSuffix:
      "Focus on electrical installation context: panels, circuits, standards (Israeli norms when visible), and safety-related notes.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / לוח חשמל",
      document: "תעודות בדיקה, הזמנות וחשבוניות חשמל",
      inventory: "חומר חשמל, לוחות ותאורה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "תעודות, תוכניות והזמנות בתחום החשמל",
      recordsLabel: "אישורי בדיקה, התקנה ובטיחות חשמל",
      homeTitle: "מרכז תפעול לצוותי חשמל — מהאתר ועד התיעוד.",
      homeDescription:
        "יומני עבודה, תעודות בדיקה, הזמנות ספק וחשבוניות בממשק אחד, עם פענוח AI שמותאם לחשמל ולתקני בטיחות.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "דיווח יומי, לוחות, שלבים והתקדמות.", kind: "REPORT" },
        {
          id: "ELEC_TEST_APPROVAL",
          label: "תעודת בדיקה / אישור התקנה",
          description: "תיעוד בדיקה חשמלית, תקן וחתימות מאשרות.",
          kind: "APPROVAL",
        },
        {
          id: "ELEC_SUPPLY_APPROVAL",
          label: "אישור אספקה / שימוש בחומר חשמל",
          description: "אישור קבלת כבלים, לוחות, תאורה או ציוד.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית עבודות חשמל",
          description: "חיוב רשמי לשלבים או לפרויקט.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  PLUMBING: {
    scanner: {
      title: "פענוח מסמכי אינסטלציה",
      subtitle: "הזמנות צינורות, אספקה, קולטים וספקים",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש אביזרים, צינורות, ברזים וכלים סניטריים" },
        { id: "PLUMBING_SUPPLY_ORDER", label: "הזמנת חומר / הצעת מחיר", description: "השוואת מחירים לצינורות (SP, פלסאון) ואביזרים" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח", description: "מעקב אחר הגעת חומרי צנרת לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "פירוט התקדמות יומית של אינסטלטורים" },
        { id: "PRESSURE_TEST_REPORT", label: "בדיקת לחץ / אטימות", description: "תיעוד בדיקות לחץ מים וביוב" },
        { id: "APPROVAL_CERT", label: "אישור שלב מים/ביוב", description: "מסירת תשתיות צנרת למזמין" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות אינסטלציה", description: "פירוט נקודות מים, ביוב וכלים סניטריים" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "system_type", label: "מערכת (קולט/ביוב/מים)" },
        { key: "total_items", label: "כמות פריטים" },
        { key: "supplier", label: "ספק / מבצע" },
        { key: "approval_status", label: "סטטוס מסמך" }
      ],
    },
    aiInstructionsSuffix: "Emphasize plumbing systems: water, drainage, fixtures, and supplier invoices.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / מערכת (מים/ביוב/קולטים)",
      document: "הזמנות צינורות, בדיקות לחץ וחשבוניות ספק",
      inventory: "צינורות, אביזרים ואטמים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות חומר, בדיקות לחץ ותוכניות מים/ביוב",
      recordsLabel: "אישורי אינסטלציה, בדיקות לחץ ואספקת צנרת",
      homeTitle: "מרכז תפעול לאינסטלטורים — מסמכי שטח ואישורים.",
      homeDescription: "מעקב אחר הזמנות, בדיקות לחץ, יומני עבודה וחשבוניות ספק, עם AI שמזהה מערכות מים וביוב.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "צוות, שלבים והתקדמות יומית.", kind: "REPORT" },
        {
          id: "PLUMB_PRESSURE_APPROVAL",
          label: "אישור בדיקת לחץ / אטימות",
          description: "תיעוד בדיקה חתומה ותוצאות.",
          kind: "APPROVAL",
        },
        {
          id: "PLUMB_MATERIAL_APPROVAL",
          label: "אישור אספקת צנרת / אביזרים",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית אינסטלציה",
          description: "חיוב רשמי לעבודות או לשלבים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  HVAC: {
    scanner: {
      title: "פענוח מסמכי מיזוג אוויר",
      subtitle: "יחידות, צ׳ילרים, התקנות ואיזון",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק", description: "רכש מזגנים, צ'ילרים, תעלות ואביזרים" },
        { id: "HVAC_ORDER", label: "הזמנת ציוד / הצעת מחיר", description: "דגמים, BTU/קילווט, פתחי אוורור" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ממוזג", description: "קבלת מעבים, מאיידים ותעלות פח באתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "שלבי התקנה, תליית תעלות והרכבת יחידות" },
        { id: "COMMISSIONING_DOC", label: "בדיקת הפעלה / כיול (Commissioning)", description: "תאריכי הפעלה ראשונית, מדידות ספיקה וטמפ'" },
        { id: "APPROVAL_CERT", label: "אישור מסירה למזמין", description: "אישור העברת מערכת המיזוג לאחריות הלקוח" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות מיזוג אוויר", description: "פירוט תעלות, גרילים, ויחידות לפי חללים" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "equipment_tag", label: "ציוד / דגם" },
        { key: "capacity", label: "הספק / נפח" },
        { key: "location", label: "מיקום באתר" },
        { key: "status", label: "סטטוס התקנה" }
      ],
    },
    aiInstructionsSuffix: "Focus on HVAC equipment tags, capacities, and installation milestones.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / מערכת מיזוג",
      document: "הזמנות ציוד, כיולים וחשבוניות ספק",
      inventory: "יחידות מיזוג, צינורות נחושת ואביזרים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות ציוד, דוחות כיול והתקנה",
      recordsLabel: "אישורי השלמת התקנה, בדיקות הפעלה ותעודות ספק",
      homeTitle: "מרכז תפעול למיזוג אוויר — ציוד, אתרים ואישורים.",
      homeDescription: "מעקב אחר יחידות, דוחות כיול, יומני עבודה וחשבוניות, עם AI שמבין דגמים, הספקים ומיקומים באתר.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "התקנה, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "HVAC_COMMISSION_APPROVAL",
          label: "אישור כיול / השלמת התקנה",
          description: "תיעוד בדיקות הפעלה ומסירה למזמין.",
          kind: "APPROVAL",
        },
        {
          id: "HVAC_EQUIP_APPROVAL",
          label: "אישור אספקת ציוד מיזוג",
          description: "אישור קבלת יחידות ואביזרים.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית מיזוג",
          description: "חיוב רשמי לפרויקט או לשלב.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  PAINTING: {
    scanner: {
      title: "פענוח מסמכי צבע וגמר",
      subtitle: "כמויות שטח, חומרים ושכבות",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק צבע", description: "רכש דליי צבע, שליכט, שפכטל, מברשות" },
        { id: "PAINT_QUANTITY", label: "כתב כמויות / אומדן מ\"ר", description: "חישוב מ\"ר, מספר שכבות, סוג צבע ושליכט" },
        { id: "MATERIAL_ORDER", label: "הזמנת חומרי גמר / הצעת מחיר", description: "כמויות פח, דליים, רולרים וחומרי מריחה" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח גוונים", description: "קבלת פחי צבע וגוונים שהוזמנו לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "רישום שלבי הכנה (שפכטל, פריימר) וגמר" },
        { id: "APPROVAL_CERT", label: "אישור סיום שלב גמר", description: "אישור מסירת שטח צבוע או שליכט" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "area_sqm", label: "שטח (מ״ר) / היקף" },
        { key: "layers", label: "סוג עבודה / שכבות" },
        { key: "color_code", label: "גוון / קוד צבע" },
        { key: "status", label: "סטטוס שלב" }
      ],
    },
    aiInstructionsSuffix: "Highlight surface areas, paint systems, and finishing scope.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / קומה וחלל",
      document: "כמויות צבע, הזמנות חומר ודוחות שטח",
      inventory: "צבע, כלים וחומרי מריחה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "כמויות שטח, הזמנות צבע ותוכניות גמר",
      recordsLabel: "אישורי שלב גמר, כמויות ואספקה",
      homeTitle: "מרכז תפעול לצבע וגמר — שטחים, חומרים ואישורים.",
      homeDescription: "ניהול כמויות, הזמנות, יומני עבודה וחשבוניות עם AI שמבין שכבות, גוונים ושטחים.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "שלבי גמר, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "PAINT_SCOPE_APPROVAL",
          label: "אישור היקף צבע / שלב גמר",
          description: "אישור כמויות או סיום שלב צביעה.",
          kind: "APPROVAL",
        },
        {
          id: "PAINT_MATERIAL_APPROVAL",
          label: "אישור אספקת צבע וחומרים",
          description: "אישור קבלת דליים וחומרי מריחה.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית צביעה וגמר",
          description: "חיוב רשמי לשלבים או למ״ר.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  FLOORING: {
    scanner: {
      title: "פענוח מסמכי ריצוף ואבן",
      subtitle: "חתכים, כמויות ואספקה",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק קרמיקה", description: "רכש אריחים, חיפויים, רובה ודבקים" },
        { id: "TILE_ORDER", label: "הזמנת ריצוף / הצעת מחיר", description: "מידות, מ״ר, סוג אבן/קרמיקה ועלות" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ממשטח", description: "וידוא אצוות, פריטים שהגיעו ופגומים" },
        { id: "SITE_LOG", label: "יומן עבודה וכוח אדם", description: "התקדמות יומית של רצפים באתר" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות ריצוף וחיפוי", description: "פירוט מידות, פנלים ושטחי ריצוף" },
        { id: "APPROVAL_CERT", label: "אישור סיום ריצוף", description: "מסירת חלל או דירה לאחר רובה" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "tile_sku", label: "דגם / מידה" },
        { key: "qty_sqm", label: "כמות מ״ר / יחידות" },
        { key: "batch", label: "אצווה / גוון" },
        { key: "status", label: "סטטוס ביצוע" }
      ],
    },
    aiInstructionsSuffix: "Focus on flooring quantities, SKUs, and delivery batches.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / חלל ורצפה",
      document: "הזמנות ריצוף, תעודות משלוח ומדידות",
      inventory: "קרמיקה, אבן ודבקים",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות מ״ר, תעודות משלוח ושרטוטים",
      recordsLabel: "אישורי אספקה, אצוות וסיום ריצוף",
      homeTitle: "מרכז תפעול לריצוף ואבן — כמויות, אספקה ואישורים.",
      homeDescription: "מעקב אחר הזמנות מ״ר, אצוות, משלוחים ויומני עבודה, עם AI שמזהה דגמים וכמויות.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה באתר", description: "ריצוף, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "FLOOR_DELIVERY_APPROVAL",
          label: "אישור אספקת ריצוף / אצווה",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "FLOOR_PHASE_APPROVAL",
          label: "אישור סיום שלב ריצוף",
          description: "אישור מסירת שטח או שלב.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית ריצוף",
          description: "חיוב רשמי לשטחים או לשלבים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  ALUMINUM: {
    scanner: {
      title: "פענוח מסמכי אלומיניום וזכוכית",
      subtitle: "מסגרות, מידות וייצור",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק אלומיניום", description: "רכש פרופילים, זכוכית, פירזול ואטמים" },
        { id: "ALU_MEASUREMENT", label: "מדידות / שרטוט פתחים", description: "מידות פתחים, כנפיים, סוגי פרופיל (קליל, אקסטל)" },
        { id: "GLASS_ORDER", label: "הזמנת זכוכית למפעל", description: "עובי, מפרט (טריפלקס, בידודית, מחוסמת)" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח זכוכית/פרופיל", description: "אישור קבלת חלונות ודלתות מוכנים לאתר" },
        { id: "SITE_LOG", label: "יומן התקנות וכוח אדם", description: "תיעוד צוותי הרכבה לפי קומות ודירות" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות אלומיניום", description: "פירוט פתחים, ויטרינות, מעקות ומחירים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת פתחים", description: "בדיקת אטימות, תריסים, ומסירה למזמין" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "opening_ref", label: "מספר פתח / חלל" },
        { key: "profile", label: "סוג פרופיל / פירזול" },
        { key: "glass_spec", label: "מפרט זכוכית / כמות" },
        { key: "status", label: "סטטוס התקנה" }
      ],
    },
    aiInstructionsSuffix: "Emphasize openings, profiles, glass specs, and installation notes.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / פתחים וקומות",
      document: "מדידות, הזמנות פרופיל וזכוכית",
      inventory: "פרופילים, זכוכית ואביזרי התקנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "שרטוטי פתחים, הזמנות פרופיל וזכוכית",
      recordsLabel: "אישורי מדידה, אספקה והתקנה",
      homeTitle: "מרכז תפעול לאלומיניום וזכוכית — פתחים, מידות ואישורים.",
      homeDescription: "מסמכי מדידה, הזמנות, יומני התקנה וחשבוניות, עם AI שמבין פרופילים ומפרטי זכוכית.",
      templates: [
        { id: "SITE_LOG", label: "יומן התקנה באתר", description: "פתחים, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "ALU_MEASURE_APPROVAL",
          label: "אישור מדידות / אישור ייצור",
          description: "תיעוד מדידות מאושרות לייצור.",
          kind: "APPROVAL",
        },
        {
          id: "ALU_GLASS_APPROVAL",
          label: "אישור אספקת זכוכית / פרופיל",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית אלומיניום",
          description: "חיוב רשמי לשלבים או לפתחים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  FINISHING: {
    scanner: {
      title: "פענוח מסמכי גמר פנים",
      subtitle: "דלתות, מטבחים, ארונות — הזמנות ואספקה",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק נגרות/גמר", description: "רכש דלתות פנים, מטבחים, פרזול וארונות" },
        { id: "JOINERY_ORDER", label: "הזמנת נגרות / שרטוט נגר", description: "מפרטים, מידות מדויקות, צירי בלום" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח ריהוט/דלתות", description: "מעקב אחר קבלת פריטי גמר לאתר" },
        { id: "SITE_LOG", label: "יומן עבודה / התקנות גמר", description: "תיעוד ימי התקנת דלתות, מטבחים וחיפויים" },
        { id: "BOQ_DOCUMENT", label: "כתב כמויות גמר פנים", description: "פירוט עלויות נגרות, חיפוי קיר, וכלים לבנים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת גמר", description: "טופס בדיקת איכות ומסירת חללים ללקוח קצה" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "room_ref", label: "חלל / דירה" },
        { key: "item_desc", label: "סוג פריט / מפרט" },
        { key: "supplier", label: "ספק / חברת נגרות" },
        { key: "status", label: "סטטוס התקנה" }
      ],
    },
    aiInstructionsSuffix: "Focus on interior finishing orders: kitchens, doors, built-ins.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / חלל פנים",
      document: "הזמנות נגרות, מטבחים ותעודות משלוח",
      inventory: "דלתות, מטבחים וריהוט מובנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הזמנות נגרות, מטבחים ותעודות אספקה",
      recordsLabel: "אישורי התקנה, מסירה ושלבי גמר",
      homeTitle: "מרכז תפעול לגמר פנים — מטבחים, דלתות ואישורים.",
      homeDescription: "הזמנות, משלוחים, יומני התקנה וחשבוניות במקום אחד, עם AI שמבין מפרטי נגרות ומטבח.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה והתקנה", description: "חללים, צוותים ושלבים.", kind: "REPORT" },
        {
          id: "FINISH_INSTALL_APPROVAL",
          label: "אישור התקנת גמר / מסירה",
          description: "אישור מסירת פריט או חלל ללקוח.",
          kind: "APPROVAL",
        },
        {
          id: "FINISH_SUPPLY_APPROVAL",
          label: "אישור אספקת גמר",
          description: "אישור קבלת מטבח, דלתות או ריהוט.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית גמר פנים",
          description: "חיוב רשמי לשלבים או לפריטים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  LANDSCAPING: {
    scanner: {
      title: "פענוח מסמכי גינון וחוץ",
      subtitle: "צמחייה, השקיה, ריצוף חוץ",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית משתלה / ספק", description: "רכש צמחייה, אדמה, טוף, מחשבי השקיה" },
        { id: "LANDSCAPE_QUOTE", label: "כתב כמויות / הצעת גינון", description: "פירוט שטחי דשא, כמות עצים, ורכיבי השקיה" },
        { id: "IRRIGATION_PARTS", label: "הזמנת מערכת השקיה", description: "ממטרות, צינורות טפטוף, ברזים חשמליים" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח", description: "קבלת כדי ענק, דשא מוכן, חלוקי נחל וצמחים" },
        { id: "SITE_LOG", label: "יומן עבודות פיתוח", description: "תיעוד יומיומי של צוותי גינון וטרקטורים" },
        { id: "APPROVAL_CERT", label: "אישור מסירת שטח חוץ", description: "בדיקת גינון, השקיה ופיתוח פיתוח סביבתי" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "zone_ref", label: "שטח / גינה" },
        { key: "item_desc", label: "צמחייה / ציוד השקיה" },
        { key: "quantity", label: "כמות / שטח" },
        { key: "status", label: "סטטוס ביצוע" }
      ],
    },
    aiInstructionsSuffix: "Emphasize landscaping scope, irrigation, and hardscape elements.",
    vocabulary: {
      client: "מזמין / קבלן ראשי",
      project: "אתר / אזור גינון",
      document: "הצעות מחיר, הזמנות צמחיה והשקיה",
      inventory: "צמחים, אבן דריכה ורכיבי השקיה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הצעות, הזמנות חומר ותוכניות גינון",
      recordsLabel: "אישורי ביצוע, אספקה ושלבי חוץ",
      homeTitle: "מרכז תפעול לגינון וחוץ — היקפים, חומרים ואישורים.",
      homeDescription: "מעקב אחר הצעות, אספקה, יומני עבודה וחשבוניות, עם AI שמבין השקיה, צמחייה וריצוף חוץ.",
      templates: [
        { id: "SITE_LOG", label: "יומן עבודה בשטח", description: "ביצוע, צוותים והתקדמות.", kind: "REPORT" },
        {
          id: "LAND_PHASE_APPROVAL",
          label: "אישור שלב גינון / חוץ",
          description: "אישור סיום שלב או אזור.",
          kind: "APPROVAL",
        },
        {
          id: "LAND_SUPPLY_APPROVAL",
          label: "אישור אספקת צמחיה / חומר",
          description: "אישור קבלת חומר לאתר.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית גינון",
          description: "חיוב רשמי לשלבים או להיקף.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
  SUBCONTRACTOR_OTHER: {
    scanner: {
      title: "פענוח מסמכי קבלן משנה",
      subtitle: "הצעות מחיר, חשבוניות ותעודות מהשטח",
      analysisTypes: [
        { id: "VENDOR_INVOICE", label: "חשבונית ספק / רכש חומרים", description: "כללי: רכש ציוד, חומרי גלם וכלים" },
        { id: "SUB_QUOTE", label: "הצעת מחיר / כתב כמויות", description: "היקף עבודה, יחידות מידה, מחירי יסוד" },
        { id: "PROGRESS_INVOICE", label: "חשבון חלקי / חשבון סופי", description: "אחוזי ביצוע מתמטברים, ניכוי מקדמות" },
        { id: "DELIVERY_NOTE", label: "תעודת משלוח / שקילה", description: "פירוט ציוד שהגיע לאתר או משקל פסולת" },
        { id: "SITE_LOG", label: "יומן עבודה יומי", description: "נוכחות צוותים, שעות טרקטור, אירועים מיוחדים" },
        { id: "APPROVAL_CERT", label: "אישור שלב / טופס איכות", description: "אישור מפקח או יזם לסיום שלב עבודה" }
      ],
      resultColumns: [
        { key: "doc_type", label: "סוג מסמך" },
        { key: "project_site", label: "אתר / מזמין" },
        { key: "phase", label: "שלב / אחוז ביצוע" },
        { key: "total", label: "סכום כולל / כמות" },
        { key: "status", label: "סטטוס מסמך" }
      ],
    },
    aiInstructionsSuffix: "Focus on subcontractor quotes, progress billing, and site reporting.",
    vocabulary: {
      client: "קבלן ראשי / מזמין",
      project: "אתר / תיק משנה",
      document: "הצעות מחיר, חשבוניות ביצוע ודוחות שטח",
      inventory: "חומרים לפי תיקי משנה",
    },
    profile: {
      clientsLabel: "פרויקטים",
      documentsLabel: "הצעות מחיר, חשבוניות ביצוע ותעודות שטח",
      recordsLabel: "אישורי התקדמות, אספקה וסגירת שלבים",
      homeTitle: "מרכז תפעול לקבלני משנה — הצעות, ביצוע וחיוב.",
      homeDescription: "ניהול הצעות, חשבוניות התקדמות, יומני שטח ואישורים, עם AI שמבין חוזים משנה ושלבים.",
      templates: [
        { id: "SITE_LOG", label: "יומן דיווח שטח", description: "ביצוע, כוח אדם ומהלך יומי.", kind: "REPORT" },
        {
          id: "SUB_PROGRESS_APPROVAL",
          label: "אישור התקדמות / אחוזים",
          description: "אישור שלב או אחוזי ביצוע.",
          kind: "APPROVAL",
        },
        {
          id: "SUB_QUOTE_ACCEPTANCE",
          label: "אישור קבלה / ניכוי להצעת משנה",
          description: "תיעוד אישור מחיר או שינוי היקף.",
          kind: "APPROVAL",
        },
        {
          id: "INVOICE",
          label: "חשבונית ביצוע / משנה",
          description: "חיוב רשמי לפי שלבים או אחוזים.",
          kind: "OFFICIAL",
          issuedDocumentType: "INVOICE",
        },
      ],
    },
  },
};

export function normalizeConstructionTrade(raw?: string | null): ConstructionTradeId {
  const u = String(raw ?? "").trim().toUpperCase();
  return CONSTRUCTION_TRADE_IDS.includes(u as ConstructionTradeId)
    ? (u as ConstructionTradeId)
    : "GENERAL_CONTRACTOR";
}

export function constructionTradeLabelHe(id: ConstructionTradeId): string {
  return LABELS_HE[id] ?? LABELS_HE.GENERAL_CONTRACTOR;
}

export function listConstructionTradesForSelect(): Array<{ id: ConstructionTradeId; label: string }> {
  return CONSTRUCTION_TRADE_IDS.map((id) => ({ id, label: LABELS_HE[id] }));
}

/** מיזוג מלא של IndustryConfig לסורק — לפי ענף, trade, ואופציונלית הודעות UI (תרגום EN/RU) */
export function getMergedIndustryConfig(
  industryRaw: string | undefined | null,
  constructionTradeRaw?: string | null,
  localeMessages?: MessageTree | null,
): IndustryConfig {
  const key = normalizeIndustryType(industryRaw) as IndustryType;
  const base = INDUSTRY_CONFIGS[key] ?? INDUSTRY_CONFIGS.GENERAL;
  if (key !== "CONSTRUCTION") {
    return base;
  }
  const trade = normalizeConstructionTrade(constructionTradeRaw);
  const patch = TRADE_PATCHES[trade];
  if (!patch) {
    return base;
  }
  let vocabulary = {
    ...base.vocabulary,
    ...(patch.vocabulary ?? {}),
  };
  vocabulary = mergeTradeVocabularyFromMessages(localeMessages ?? undefined, trade, vocabulary);

  let scanner = {
    ...base.scanner,
    ...patch.scanner,
    analysisTypes: patch.scanner.analysisTypes ?? base.scanner.analysisTypes,
    resultColumns: patch.scanner.resultColumns ?? base.scanner.resultColumns,
  };
  scanner = mergeScannerShellFromMessages(localeMessages ?? undefined, trade, scanner);
  scanner = {
    ...scanner,
    analysisTypes: mergeAnalysisTypesFromMessages(localeMessages ?? undefined, trade, scanner.analysisTypes),
    resultColumns: mergeResultColumnsFromMessages(
      localeMessages ?? undefined,
      trade,
      scanner.resultColumns,
    ),
  };

  return {
    ...base,
    vocabulary,
    scanner,
    aiInstructions: patch.aiInstructionsSuffix
      ? `${base.aiInstructions} ${patch.aiInstructionsSuffix}`
      : base.aiInstructions,
  };
}

/** תוויות מסך הבית, מסמכים ותבניות הנפקה — רק כשמקצוע הבנייה אינו «קבלן ראשי» כללי */
export type ConstructionTradeProfileOverlay = NonNullable<ConstructionTradePatch["profile"]>;

export function getConstructionTradeProfileOverlay(
  constructionTradeRaw?: string | null,
): ConstructionTradeProfileOverlay | null {
  const trade = normalizeConstructionTrade(constructionTradeRaw);
  if (trade === "GENERAL_CONTRACTOR") return null;
  const patch = TRADE_PATCHES[trade];
  return patch?.profile ?? null;
}
