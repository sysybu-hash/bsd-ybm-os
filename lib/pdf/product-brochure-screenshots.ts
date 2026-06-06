import fs from "node:fs";
import path from "node:path";

export type ProductBrochureScreenshot = {
  file: string;
  captionHe: string;
  titleHe: string;
  subtitleHe: string;
  highlights?: string[];
};

export const PRODUCT_BROCHURE_SCREENSHOT_DIR = path.join(
  process.cwd(),
  "assets",
  "product-brochure",
);

export const PRODUCT_BROCHURE_SCREENSHOTS: ProductBrochureScreenshot[] = [
  {
    file: "marketing-landing.png",
    captionHe: "נחיתה שיווקית",
    titleHe: "הרושם הראשון",
    subtitleHe: "מיתוג ברור, קריאה לפעולה, והצגת ערך — לפני כניסה למערכת.",
    highlights: ["עברית RTL", "מצב כהה/בהיר", "הדגשת AI ו-Gemini Live"],
  },
  {
    file: "workspace-home.png",
    captionHe: "שולחן עבודה",
    titleHe: "מרחב העבודה שלך",
    subtitleHe: "רשת Hub מרכזית, סרגל יישומים וחלונות צפים — הכל במקום אחד.",
    highlights: ["6 אריחי ליבה", "לשוניות כלי עזר", "Omnibar לפקודות מהירות"],
  },
  {
    file: "finance-hub.png",
    captionHe: "פיננסים",
    titleHe: "שליטה פיננסית בזמן אמת",
    subtitleHe: "דאשבורד KPI, תזרים מזומנים ותובנות — מוכן לרואה חשבון.",
    highlights: ["ייצוא CSV/PDF", "תובנות יומיות", "תמונת מצב אחת"],
  },
  {
    file: "projects-hub.png",
    captionHe: "פרויקטים",
    titleHe: "פרויקטים בלי אקסלים מפוזרים",
    subtitleHe: "לוח Kanban ומרכז שליטה — תקציב, לוח זמנים ומחברת AI.",
    highlights: ["מרכז שליטה לפרויקט", "משימות ואבני דרך", "קישור ל-CRM ולמסמכים"],
  },
  {
    file: "crm-table.png",
    captionHe: "CRM",
    titleHe: "לקוחות במרכז",
    subtitleHe: "אנשי קשר, חיפוש סמנטי וייבוא — מחובר לפרויקטים.",
    highlights: ["חיפוש לפי משמעות", "סנכרון Meckano", "קישור לפרויקטים"],
  },
  {
    file: "documents-hub.png",
    captionHe: "מסמכים",
    titleHe: "מסמכים מסודרים מקצה לקצה",
    subtitleHe: "ארכיון ERP, הפקת הצעות/חשבוניות וסורק AI.",
    highlights: ["הפקה מקצועית", "סריקת חשבוניות", "השוואת מחירים"],
  },
  {
    file: "ai-hub.png",
    captionHe: "בינה מלאכותית",
    titleHe: "AI שעובד על הנתונים שלך",
    subtitleHe: "צ'אט מלא, Gemini Live ומחקר מסמכים — בתוך ההקשר הארגוני.",
    highlights: ["צירוף קבצים", "עוזר קולי", "NotebookLM"],
  },
];

export function loadProductScreenshotDataUrl(fileName: string): string | null {
  const full = path.join(PRODUCT_BROCHURE_SCREENSHOT_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  const buf = fs.readFileSync(full);
  return `data:image/png;base64,${buf.toString("base64")}`;
}

export function listMissingProductScreenshots(): string[] {
  return PRODUCT_BROCHURE_SCREENSHOTS.filter(
    (s) => !fs.existsSync(path.join(PRODUCT_BROCHURE_SCREENSHOT_DIR, s.file)),
  ).map((s) => s.file);
}
