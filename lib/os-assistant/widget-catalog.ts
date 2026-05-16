import type { AppLocale } from "@/lib/i18n/config";
import { normalizeLocale } from "@/lib/i18n/config";
import type { WidgetType } from "@/hooks/use-window-manager";

export type OsWidgetAction = {
  id: WidgetType;
  labelHe: string;
  labelEn: string;
  labelRu: string;
  keywords: string[];
};

/** כל הווידג'טים שהעוזר יכול לפתוח */
export const OS_ASSISTANT_WIDGETS: OsWidgetAction[] = [
  {
    id: "dashboard",
    labelHe: "דאשבורד פיננסי",
    labelEn: "Financial dashboard",
    labelRu: "Финансовая панель",
    keywords: ["דאשבורד", "dashboard", "סטטוס"],
  },
  {
    id: "projectBoard",
    labelHe: "לוח פרויקטים",
    labelEn: "Project board",
    labelRu: "Доска проектов",
    keywords: ["פרויקטים", "לוח", "משימות", "projects"],
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
  },
  {
    id: "docCreator",
    labelHe: "הפקת מסמכים",
    labelEn: "Document creator",
    labelRu: "Создание документов",
    keywords: ["הצעה", "חשבונית", "מסמך", "invoice", "quote"],
  },
  {
    id: "aiScanner",
    labelHe: "סורק AI",
    labelEn: "AI scanner",
    labelRu: "AI-сканер",
    keywords: ["סריקה", "סרוק", "פענוח", "scan"],
  },
  {
    id: "aiChatFull",
    labelHe: "צ'אט AI מלא",
    labelEn: "Full AI chat",
    labelRu: "Полный AI-чат",
    keywords: ["צ'אט", "שיחה", "ai", "chat"],
  },
  {
    id: "notebookLM",
    labelHe: "NotebookLM",
    labelEn: "NotebookLM",
    labelRu: "NotebookLM",
    keywords: ["מחברת", "notebook", "מחקר"],
  },
  {
    id: "googleDrive",
    labelHe: "Google Drive",
    labelEn: "Google Drive",
    labelRu: "Google Drive",
    keywords: ["דרייב", "drive", "קבצים", "files"],
  },
  {
    id: "googleAssistant",
    labelHe: "Google Assistant",
    labelEn: "Google Assistant",
    labelRu: "Google Assistant",
    keywords: ["assistant", "עוזר גוגל", "google"],
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
    labelHe: "פרויקט בודד",
    labelEn: "Single project",
    labelRu: "Проект",
    keywords: ["פרויקט", "project"],
  },
  {
    id: "cashflow",
    labelHe: "תזרים מזומנים",
    labelEn: "Cash flow",
    labelRu: "Денежный поток",
    keywords: ["תזרים", "cash", "מזומנים"],
  },
  {
    id: "erp",
    labelHe: "מסמכי ERP",
    labelEn: "ERP documents",
    labelRu: "Документы ERP",
    keywords: ["erp", "מסמכים"],
  },
  {
    id: "accessibility",
    labelHe: "נגישות",
    labelEn: "Accessibility",
    labelRu: "Доступность",
    keywords: ["נגישות", "accessibility"],
  },
];

const ALIASES: Record<string, WidgetType> = {
  crm: "crmTable",
  erp: "erpArchive",
  aiChat: "aiChatFull",
  quoteGen: "docCreator",
  scan: "aiScanner",
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
  return OS_ASSISTANT_WIDGETS.map((w) => `- ${w.id}: ${labelForLocale(w, loc)}`).join("\n");
}
