import type { WidgetType } from "@/hooks/use-window-manager";

export type OsWidgetAction = {
  id: WidgetType;
  labelHe: string;
  keywords: string[];
};

/** כל הווידג'טים שהעוזר יכול לפתוח */
export const OS_ASSISTANT_WIDGETS: OsWidgetAction[] = [
  { id: "dashboard", labelHe: "דאשבורד פיננסי", keywords: ["דאשבורד", "dashboard", "סטטוס"] },
  { id: "projectBoard", labelHe: "לוח פרויקטים", keywords: ["פרויקטים", "לוח", "משימות"] },
  { id: "crmTable", labelHe: "ניהול לקוחות CRM", keywords: ["לקוחות", "crm", "אנשי קשר"] },
  { id: "erpArchive", labelHe: "ארכיון ERP", keywords: ["ארכיון", "erp", "מסמכים"] },
  { id: "docCreator", labelHe: "הפקת מסמכים", keywords: ["הצעה", "חשבונית", "מסמך"] },
  { id: "aiScanner", labelHe: "סורק AI", keywords: ["סריקה", "סרוק", "פענוח"] },
  { id: "aiChatFull", labelHe: "צ'אט AI מלא", keywords: ["צ'אט", "שיחה", "ai"] },
  { id: "notebookLM", labelHe: "NotebookLM", keywords: ["מחברת", "notebook", "מחקר"] },
  { id: "googleDrive", labelHe: "Google Drive", keywords: ["דרייב", "drive", "קבצים"] },
  { id: "googleAssistant", labelHe: "Google Assistant", keywords: ["assistant", "עוזר גוגל"] },
  { id: "meckanoReports", labelHe: "דוחות Meckano", keywords: ["מקאנו", "שעות", "נוכחות"] },
  { id: "settings", labelHe: "הגדרות", keywords: ["הגדרות", "settings"] },
  { id: "project", labelHe: "פרויקט בודד", keywords: ["פרויקט"] },
];

const ALIASES: Record<string, WidgetType> = {
  crm: "crmTable",
  erp: "erpArchive",
  aiChat: "aiChatFull",
  quoteGen: "docCreator",
};

export function normalizeWidgetAction(raw: string): WidgetType | null {
  const key = raw.trim();
  if (!key) return null;
  const aliased = ALIASES[key] ?? key;
  return OS_ASSISTANT_WIDGETS.some((w) => w.id === aliased) ? (aliased as WidgetType) : null;
}

export function widgetCatalogForPrompt(): string {
  return OS_ASSISTANT_WIDGETS.map((w) => `- ${w.id}: ${w.labelHe}`).join("\n");
}
