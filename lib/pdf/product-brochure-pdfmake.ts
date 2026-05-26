import type { Content, TDocumentDefinitions } from "pdfmake/interfaces";
import pdfMakeImport from "pdfmake";
import {
  loadPdfFontBuffers,
  PDF_FONT_VFS_KEYS,
} from "@/lib/pdf/load-pdf-font-buffers";

type PdfMakeInstance = {
  virtualfs: { writeFileSync: (name: string, content: Buffer) => void };
  setFonts: (fonts: Record<string, { normal: string; bold: string }>) => void;
  setLocalAccessPolicy: (fn: (p: string) => boolean) => void;
  createPdf: (def: TDocumentDefinitions) => { getBuffer: () => Promise<Buffer> };
};

function resolvePdfMake(): PdfMakeInstance {
  const mod = pdfMakeImport as unknown as PdfMakeInstance & { default?: PdfMakeInstance };
  const instance =
    mod && typeof mod.createPdf === "function"
      ? mod
      : mod?.default && typeof mod.default.createPdf === "function"
        ? mod.default
        : null;
  if (!instance) throw new Error("pdfmake failed to load");
  return instance;
}

let pdfMakeSingleton: PdfMakeInstance | null = null;

function getPdfMake(): PdfMakeInstance {
  if (!pdfMakeSingleton) {
    pdfMakeSingleton = resolvePdfMake();
    pdfMakeSingleton.setLocalAccessPolicy(() => false);
  }
  return pdfMakeSingleton;
}

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;
  const pdfmake = getPdfMake();
  const { regular, bold } = loadPdfFontBuffers();
  pdfmake.virtualfs.writeFileSync(PDF_FONT_VFS_KEYS.regular, regular);
  pdfmake.virtualfs.writeFileSync(PDF_FONT_VFS_KEYS.bold, bold);
  pdfmake.setFonts({
    NotoHebrew: {
      normal: PDF_FONT_VFS_KEYS.regular,
      bold: PDF_FONT_VFS_KEYS.bold,
    },
  });
  fontsReady = true;
}

const INDIGO = "#4f46e5";
const INDIGO_DARK = "#312e81";
const SLATE = "#0f172a";
const MUTED = "#64748b";
const BORDER = "#e2e8f0";
const EMERALD = "#059669";

function headerBand(title: string, subtitle: string): Content {
  return {
    table: {
      widths: ["*"],
      body: [
        [
          {
            stack: [
              { text: title, style: "bandTitle" },
              { text: subtitle, style: "bandSub" },
            ],
            fillColor: INDIGO,
            margin: [18, 16, 18, 16],
          },
        ],
      ],
    },
    layout: "noBorders",
    margin: [0, 0, 0, 14],
  };
}

function sectionTitle(text: string): Content {
  return { text, style: "sectionTitle", margin: [0, 8, 0, 6] };
}

function body(text: string): Content {
  return { text, style: "body", margin: [0, 0, 0, 8] };
}

function bullets(items: string[]): Content {
  return {
    ul: items,
    style: "bullet",
    margin: [0, 0, 0, 10],
  };
}

function featureTable(rows: [string, string][]): Content {
  return {
    table: {
      widths: ["32%", "*"],
      body: [
        [
          { text: "מודול", style: "th" },
          { text: "יכולות עיקריות", style: "th" },
        ],
        ...rows.map(([name, desc]) => [
          { text: name, style: "tdName" },
          { text: desc, style: "tdDesc" },
        ]),
      ],
    },
    layout: {
      hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
        i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: () => BORDER,
      paddingLeft: () => 8,
      paddingRight: () => 8,
      paddingTop: () => 6,
      paddingBottom: () => 6,
    },
    margin: [0, 0, 0, 12],
  };
}

function buildDocDefinition(): TDocumentDefinitions {
  const generated = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    pageSize: "A4",
    pageMargins: [48, 56, 48, 56],
    defaultStyle: {
      font: "NotoHebrew",
      fontSize: 10.5,
      alignment: "right",
      color: SLATE,
      lineHeight: 1.35,
    },
    styles: {
      coverBrand: { fontSize: 28, bold: true, color: INDIGO, alignment: "center" },
      coverTag: { fontSize: 14, color: MUTED, alignment: "center", margin: [0, 8, 0, 0] },
      coverHero: {
        fontSize: 22,
        bold: true,
        color: SLATE,
        alignment: "center",
        margin: [0, 24, 0, 8],
      },
      coverLead: { fontSize: 11, color: MUTED, alignment: "center", lineHeight: 1.5 },
      coverBadge: {
        fontSize: 9,
        bold: true,
        color: "#ffffff",
        fillColor: EMERALD,
        alignment: "center",
        margin: [0, 20, 0, 0],
      },
      bandTitle: { fontSize: 18, bold: true, color: "#ffffff", alignment: "right" },
      bandSub: { fontSize: 10, color: "#c7d2fe", alignment: "right", margin: [0, 4, 0, 0] },
      sectionTitle: { fontSize: 14, bold: true, color: INDIGO_DARK },
      body: { fontSize: 10.5, color: SLATE },
      bullet: { fontSize: 10, color: SLATE },
      th: { fontSize: 9, bold: true, color: "#ffffff", fillColor: INDIGO, alignment: "right" },
      tdName: { fontSize: 10, bold: true, color: INDIGO_DARK },
      tdDesc: { fontSize: 9.5, color: SLATE },
      footer: { fontSize: 8, color: "#94a3b8", alignment: "center" },
      highlight: { fontSize: 11, bold: true, color: INDIGO },
    },
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: "BSD-YBM OS · דף מוצר לשיווק", style: "footer", alignment: "right" },
        {
          text: `עמוד ${currentPage} מתוך ${pageCount}`,
          style: "footer",
          alignment: "left",
        },
      ],
      margin: [48, 0, 48, 24],
    }),
    content: [
      {
        stack: [
          { text: "BSD-YBM OS", style: "coverBrand" },
          { text: "מערכת הפעלה לניהול עסק · CRM · ERP · AI", style: "coverTag" },
          { text: "מרכז בקרה אחד לעסק שלך", style: "coverHero" },
          {
            text:
              "תוכנה אחת שמחברת לקוחות, פרויקטים, מסמכים, כספים, שטח ו-AI — בעיצוב שולחן עבודה מודרני, בעברית ובאנגלית.",
            style: "coverLead",
          },
          { text: `מסמך מוצר · עודכן ${generated}`, style: "coverBadge" },
        ],
        margin: [0, 80, 0, 0],
      },
      { text: "", pageBreak: "after" },

      headerBand("סיכום מנהלים", "למה BSD-YBM OS"),
      body(
        "BSD-YBM OS היא פלטפורמת SaaS מרובת-דיירים (Multi-Tenant) לניהול עסקים — במיוחד בענף הבנייה, קבלנים וניהול חברות — המאחדת CRM, ERP, סריקת מסמכים, הפקת חשבוניות והצעות, דוחות פיננסיים ועוזר AI קולי וטקסטואלי בממשק אחד.",
      ),
      bullets([
        "שולחן עבודה עם חלונות צפים, סרגל יישומים ו-Omnibar — פקודות טבעיות לפתיחת כלים.",
        "שישה Hub מרכזיים: פיננסים, פרויקטים, CRM, מסמכים, קופיילוט שטח (בנייה), ובינה מלאכותית.",
        "אינטגרציות: Google (התחברות, Drive, Calendar), Meckano, PayPal, PayPlus, Gemini Live.",
        "רב-לשוניות מלאה: עברית (ברירת מחדל), אנגלית ורוסית — RTL מובנה.",
        "אבטחה: אימות NextAuth, הרשאות לפי ארגון ותפקיד, Rate limiting, ניטור Sentry.",
      ]),

      headerBand("חוויית משתמש", "מרחב העבודה (OS)"),
      sectionTitle("איך עובדים במערכת"),
      bullets([
        "כניסה מאובטחת (Google / אימייל וסיסמה לפי הגדרות הארגון).",
        "מסך בית עם רשת אריחים (Quick Grid) — גישה מהירה לכל Hub.",
        "כל יישום נפתח בחלון נפרד: גרירה, שינוי גודל, מיקוד ומקסום.",
        "Omnibar — שורת פקודה בתחתית: חיפוש, פתיחת סורק/צ'אט/מסמכים, שאלות כלליות.",
        "עוזר OS: פתיחת ווידג'טים בקול (Gemini Live) או בטקסט לפי הרשאות.",
        "מרכז התראות, גרירת קבצים לסריקה, מצב כהה/בהיר, התאמת Launcher אישית.",
        "מרכז עזרה מובנה עם מדריכים לפי נושא.",
      ]),

      headerBand("מודולי ליבה", "Hubs ויישומים"),
      sectionTitle("אריחי מרכז (ברירת מחדל)"),
      featureTable([
        [
          "פיננסים",
          "דאשבורד KPI, תזרים מזומנים, תובנות יומיות (Cron), ייצוא CSV/PDF לרואה חשבון.",
        ],
        [
          "פרויקטים",
          "לוח פרויקטים (Kanban), מרכז שליטה לפרויקט — תקציב, לוח זמנים, מחברת פרויקט עם AI.",
        ],
        ["CRM", "אנשי קשר, חיפוש סמנטי, ייבוא, קישור לפרויקטים ולמרכז שליטה."],
        [
          "מסמכים",
          "ארכיון ERP, הפקת הצעות/חשבוניות/קבלות, סורק AI (Vision + מנועי ניתוח), השוואת מחירים.",
        ],
        [
          "קופיילוט שטח",
          "הצעות מהשטח לענף בנייה — לקוח, פרויקט, מדיה, שליחה ללקוח.",
        ],
        [
          "בינה מלאכותית",
          "צ'אט AI מלא (טקסט + קבצים), Gemini Live (קול), NotebookLM — מחקר על מסמכים.",
        ],
      ]),
      sectionTitle("יישומים נוספים (סרגל / תפריט «עוד»)"),
      featureTable([
        ["Google Drive", "עיון בקבצים, חיבור למחברת ולזרימות מסמכים."],
        ["דוחות Meckano", "נוכחות, אזורים, דוחות שעות — לפי מנוי."],
        ["הגדרות", "ארגון, מנוי, אינטגרציות, משתמשים והרשאות."],
        ["נגישות", "הגדרות נגישות בממשק."],
        ["מרכז עזרה", "מדריכים: התחלה, סורק, CRM, ERP, Drive, מקאנו, פתרון תקלות."],
        ["ניהול מערכת", "קונסולת אדמין פלטפורמה (למפעיל בלבד)."],
      ]),

      { text: "", pageBreak: "after" },

      headerBand("בינה מלאכותית", "AI מובנה בכל זרימה"),
      sectionTitle("יכולות AI"),
      bullets([
        "צ'אט AI — שיחה עם הקשר ארגון/פרויקט, צירוף קבצים, Vault ידע.",
        "Gemini Live — עוזר קולי: פקודות, ניווט, סטטוס בזמן אמת.",
        "סורק מסמכים — חילוץ שדות מחשבוניות ומסמכים (כולל Document AI / מנועי גיבוי).",
        "מחברת פרויקט (Notebook) — שאלות על מסמכי ERP ופרויקט בזרימת שיחה.",
        "מחולל מסמכים AI — טיוטות והצעות מחיר חכמות.",
        "חיפוש סמנטי ב-CRM — מציאת לקוחות לפי משמעות, לא רק מילות מפתח.",
        "תובנות פיננסיות אוטומטיות — ניתוח יומי (Cron + Sentry Crons).",
        "עוזר מפעיל (Operator) — אוטומציות מונחות AI במערכת.",
      ]),

      headerBand("אינטגרציות ותשלומים", "מחברים את מה שכבר עובד אצלכם"),
      bullets([
        "Google OAuth — כניסה מהירה; Google Drive ו-Calendar לסנכרון קבצים ויומן.",
        "Meckano — שעון נוכחות, אזורים, דוחות, סנכרון אנשי קשר ל-CRM.",
        "PayPal ו-PayPlus — גבייה, מנויים, Webhooks מאומתים (HMAC).",
        "חתימה דיגיטלית — קישור חתימה להצעות מחיר; מעקב סטטוס.",
        "הזמנות לארגון — הזמנת משתמשים ל-workspace.",
        "PostHog — אנליטיקת מוצר; Sentry — ניטור שגיאות.",
      ]),

      headerBand("אבטחה ואמינות", "Enterprise-ready"),
      bullets([
        "PostgreSQL (Neon) + Prisma — נתונים מופרדים לפי ארגון.",
        "JWT sessions, הרשאות תפקיד (אדמין ארגון, מנהל פרויקט, עובד, לקוח).",
        "Rate limiting על API ציבוריים; CSP וכותרות אבטחה בפרודקשן.",
        "PII מסונן בלוגים; אין שמירת סיסמאות בטקסט גלוי.",
        "גיבוי ו-DR — תיעוד תרגילי התאוששות (Neon).",
        "בדיקות: Jest (יחידה), Playwright (E2E), ביקורת נגישות axe.",
      ]),

      headerBand("למי זה מתאים", "קהלי יעד"),
      featureTable([
        ["קבלני בנייה", "פרויקטים, שטח, מסמכים, תקציב ו-CRM במקום אחד."],
        ["ניהול חברה", "מצב ללא Meckano/שטח — דגש על CRM, ERP ופיננסים."],
        ["מנהלי פרויקטים", "לוח משימות, מרכז שליטה, מחברת AI."],
        ["כספים וחשבונאות", "הפקת מסמכים, מע״מ, ייצוא לרואה חשבון."],
        ["בעלי עסקים", "תמונת מצב אחת — דשבורד והתראות."],
      ]),

      headerBand("טכנולוגיה", "תשתית מודרנית"),
      bullets([
        "Next.js 15 · React 18 · TypeScript strict.",
        "ענן: Vercel · DB: Neon PostgreSQL.",
        "AI: Google Gemini (עם גיבוי ספקים), Document AI, אפשרות OpenAI/Anthropic.",
        "עיצוב: Tailwind, RTL, PWA (Service Worker).",
      ]),

      {
        margin: [0, 16, 0, 0],
        table: {
          widths: ["*"],
          body: [
            [
              {
                stack: [
                  { text: "מוכנים להתחיל?", style: "highlight", alignment: "center" },
                  {
                    text: "התחברות · הדגמה · פתיחת חשבון ארגוני",
                    alignment: "center",
                    margin: [0, 6, 0, 0],
                    color: MUTED,
                    fontSize: 10,
                  },
                  {
                    text: "בעזרת ה' נעשה ונצליח — BSD-YBM",
                    alignment: "center",
                    margin: [0, 10, 0, 0],
                    bold: true,
                    color: INDIGO,
                  },
                ],
                fillColor: "#eef2ff",
                margin: [12, 14, 12, 14],
              },
            ],
          ],
        },
        layout: "noBorders",
      },
    ],
  } as TDocumentDefinitions;
}

/** pdfmake — גיבוי כשאין Chrome (למשל CI ללא דפדפן) */
export async function renderProductBrochurePdfMake(): Promise<Uint8Array> {
  ensureFonts();
  const pdfDoc = getPdfMake().createPdf(buildDocDefinition());
  const buffer = await pdfDoc.getBuffer();
  return new Uint8Array(buffer);
}
