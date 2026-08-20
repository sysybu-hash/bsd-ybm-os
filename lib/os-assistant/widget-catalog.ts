import type { AppLocale } from "@/lib/i18n/config";
import { normalizeLocale } from "@/lib/i18n/config";
import type { WidgetType } from "@/hooks/use-window-manager";

export type OsWidgetAction = {
  id: WidgetType;
  labelHe: string;
  labelEn: string;
  labelRu: string;
  keywords: string[];
  /** Hidden from launcher picker — still valid for open/resolve aliases */
  pickerHidden?: boolean;
};

/** כל הווידג'טים שהעוזר יכול לפתוח */
export const OS_ASSISTANT_WIDGETS: OsWidgetAction[] = [
  {
    id: "dashboard",
    labelHe: "דאשבורד פיננסי",
    labelEn: "Financial dashboard",
    labelRu: "Финансовая панель",
    keywords: ["דאשבורד", "dashboard", "סטטוס"],
    pickerHidden: true,
  },
  {
    id: "projectBoard",
    labelHe: "לוח פרויקטים",
    labelEn: "Project board",
    labelRu: "Доска проектов",
    keywords: ["פרויקטים", "לוח", "משימות", "projects"],
    pickerHidden: true,
  },
  {
    id: "crmTable",
    labelHe: "ניהול לקוחות CRM",
    labelEn: "CRM clients",
    labelRu: "CRM клиенты",
    keywords: ["לקוחות", "crm", "אנשי קשר", "clients"],
  },
  {
    id: "erpArchive",
    labelHe: "ארכיון ERP",
    labelEn: "ERP archive",
    labelRu: "Архив ERP",
    keywords: ["ארכיון", "erp", "מסמכים", "documents"],
    pickerHidden: true,
  },
  {
    id: "docCreator",
    labelHe: "הפקת מסמכים",
    labelEn: "Document creator",
    labelRu: "Создание документов",
    keywords: ["הצעה", "חשבונית", "מסמך", "invoice", "quote"],
    pickerHidden: true,
  },
  {
    id: "aiScanner",
    labelHe: "סורק AI",
    labelEn: "AI scanner",
    labelRu: "AI-сканер",
    keywords: ["סריקה", "סרוק", "פענוח", "scan"],
    pickerHidden: true,
  },
  {
    id: "aiChatFull",
    labelHe: "צ'אט AI מלא",
    labelEn: "Full AI chat",
    labelRu: "Полный AI-чат",
    keywords: ["צ'אט", "שיחה", "ai", "chat"],
    pickerHidden: true,
  },
  {
    id: "notebookLM",
    labelHe: "NotebookLM",
    labelEn: "NotebookLM",
    labelRu: "NotebookLM",
    keywords: ["מחברת", "notebook", "מחקר"],
    pickerHidden: true,
  },
  {
    id: "googleDrive",
    labelHe: "Google Drive",
    labelEn: "Google Drive",
    labelRu: "Google Drive",
    keywords: ["דרייב", "drive", "קבצים", "files"],
  },
  {
    id: "googleCalendar",
    labelHe: "יומן Google",
    labelEn: "Google Calendar",
    labelRu: "Google Calendar",
    keywords: ["יומן", "calendar", "אירועים", "events", "סנכרון"],
  },
  {
    id: "jewishCalendar",
    labelHe: "לוח עברי וזמנים",
    labelEn: "Hebrew calendar & zmanim",
    labelRu: "Еврейский календарь и зманим",
    keywords: ["עברי", "זמנים", "שבת", "תאריך", "שעון", "zmanim", "luach", "hebrew"],
  },
  {
    id: "meckanoReports",
    labelHe: "דוחות Meckano",
    labelEn: "Meckano reports",
    labelRu: "Отчёты Meckano",
    keywords: ["מקאנו", "שעות", "נוכחות", "meckano"],
  },
  {
    id: "settings",
    labelHe: "הגדרות",
    labelEn: "Settings",
    labelRu: "Настройки",
    keywords: ["הגדרות", "settings"],
  },
  {
    id: "project",
    labelHe: "מרכז שליטה לפרויקט",
    labelEn: "Project control center",
    labelRu: "Центр управления проектом",
    keywords: ["פרויקט", "project", "גנט", "תקציב", "יומן עבודה"],
    pickerHidden: true,
  },
  {
    id: "cashflow",
    labelHe: "תזרים מזומנים",
    labelEn: "Cash flow",
    labelRu: "Денежный поток",
    keywords: ["תזרים", "cash", "מזומנים"],
    pickerHidden: true,
  },
  {
    id: "erp",
    labelHe: "מסמכי ERP",
    labelEn: "ERP documents",
    labelRu: "Документы ERP",
    keywords: ["erp", "מסמכים"],
    pickerHidden: true,
  },
  {
    id: "accessibility",
    labelHe: "נגישות",
    labelEn: "Accessibility",
    labelRu: "Доступность",
    keywords: ["נגישות", "accessibility"],
  },
  {
    id: "helpCenter",
    labelHe: "מרכז עזרה",
    labelEn: "Help center",
    labelRu: "Справка",
    keywords: ["עזרה", "help", "מדריך", "faq", "תמיכה"],
  },
  {
    id: "fieldCopilot",
    labelHe: "קופיילוט שטח",
    labelEn: "Field Copilot",
    labelRu: "Полевой копilot",
    keywords: ["שטח", "field", "copilot", "הצעה מהירה", "אתר", "site", "קבלן"],
  },
  {
    id: "appBuilder",
    labelHe: "מחולל אפליקציות AI",
    labelEn: "AI App Builder",
    labelRu: "AI конструктор приложений",
    keywords: ["app", "builder", "form", "טופס", "ai", "מחולל", "אפליקציה"],
    pickerHidden: true,
  },
  {
    id: "financeHub",
    labelHe: "פיננסים",
    labelEn: "Finance hub",
    labelRu: "Финансы",
    keywords: ["דאשבורד", "dashboard", "תזרים", "cashflow", "פיננסים"],
  },
  {
    id: "projectsHub",
    labelHe: "פרויקטים",
    labelEn: "Projects hub",
    labelRu: "Проекты",
    keywords: ["פרויקטים", "לוח", "project", "board", "גנט", "משימות"],
  },
  {
    id: "documentsHub",
    labelHe: "מסמכים",
    labelEn: "Documents hub",
    labelRu: "Документы",
    keywords: ["מסמכים", "ארכיון", "הפקה", "סריקה", "erp", "scan", "חשבונית", "invoice"],
  },
  {
    id: "aiHub",
    labelHe: "בינה מלאכותית",
    labelEn: "AI hub",
    labelRu: "ИИ",
    keywords: ["ai", "צ'אט", "chat", "notebook", "מחברת", "מחולל", "builder", "app"],
  },
  {
    id: "logisticsHub",
    labelHe: "לוגיסטיקה וציוד",
    labelEn: "Logistics & assets",
    labelRu: "Логистика и оборудование",
    keywords: ["מלאי", "inventory", "ציוד", "assets", "מחסן", "warehouse", "כלים", "logistics"],
  },
  {
    id: "procurementHub",
    labelHe: "רכש והזמנות",
    labelEn: "Procurement",
    labelRu: "Закупки",
    keywords: ["רכש", "procurement", "הזמנה", "po", "ספק", "supplier", "דרישת רכש", "pr"],
  },
  {
    id: "executiveHub",
    labelHe: "מרכז מנהל",
    labelEn: "Executive overview",
    labelRu: "Обзор руководства",
    keywords: ["מנהל", "executive", "סקירה", "דשבורד", "אסטרטגי", "overview", "kpi"],
  },
  {
    id: "platformAdmin",
    labelHe: "ניהול מערכת",
    labelEn: "Platform admin",
    labelRu: "Админ",
    keywords: ["אדמין", "admin", "מנהל", "מנויים", "הרשמות"],
  },
  {
    id: "universalCommand",
    labelHe: "מרכז בקרה ופעולות מהירות",
    labelEn: "Command center",
    labelRu: "Центр команд",
    keywords: ["מרכז", "בקרה", "פעולות", "מהיר", "command", "center", "quick", "actions"],
  },
];

const ALIASES: Record<string, WidgetType> = {
  crm: "crmTable",
  erp: "erpArchive",
  aiChat: "aiChatFull",
  quoteGen: "docCreator",
  scan: "aiScanner",
  field: "fieldCopilot",
  executive: "executiveHub",
};

function labelForLocale(w: OsWidgetAction, locale: AppLocale): string {
  if (locale === "en") return w.labelEn;
  if (locale === "ru") return w.labelRu;
  return w.labelHe;
}

export function normalizeWidgetAction(raw: string): WidgetType | null {
  const key = raw.trim();
  if (!key) return null;
  const aliased = ALIASES[key] ?? key;
  return OS_ASSISTANT_WIDGETS.some((w) => w.id === aliased) ? (aliased as WidgetType) : null;
}

export function widgetCatalogForPrompt(locale?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  return OS_ASSISTANT_WIDGETS.filter((w) => !w.pickerHidden)
    .map((w) => `- ${w.id}: ${labelForLocale(w, loc)}`)
    .join("\n");
}
