import type { AppLocale } from "@/lib/i18n/config";
import { normalizeLocale } from "@/lib/i18n/config";
import type { AutomationIntent } from "@/lib/os-automations/types";

export type AutomationCatalogEntry = {
  id: AutomationIntent;
  labelHe: string;
  labelEn: string;
  labelRu: string;
  keywords: string[];
};

export const AUTOMATION_CATALOG: AutomationCatalogEntry[] = [
  { id: "open_widget", labelHe: "פתיחת מסך", labelEn: "Open screen", labelRu: "Открыть экран", keywords: ["פתח", "open", "הצג"] },
  { id: "create_invoice", labelHe: "יצירת חשבונית", labelEn: "Create invoice", labelRu: "Создать счёт", keywords: ["חשבונית", "invoice", "הפק", "צור"] },
  { id: "create_quote", labelHe: "יצירת הצעת מחיר", labelEn: "Create quote", labelRu: "Создать предложение", keywords: ["הצעה", "quote"] },
  { id: "open_scanner", labelHe: "פתיחת סורק", labelEn: "Open scanner", labelRu: "Открыть сканер", keywords: ["סרוק", "סריקה", "scan"] },
  { id: "scan_with_instructions", labelHe: "סריקה עם הנחיות", labelEn: "Scan with instructions", labelRu: "Скан с инструкциями", keywords: ["סרוק עם", "scan with"] },
  { id: "save_scan_to_notebook", labelHe: "שמירת סריקה במחברת", labelEn: "Save scan to notebook", labelRu: "Сохранить скан в блокнот", keywords: ["מחברת", "notebook", "שמור סריקה"] },
  { id: "open_crm", labelHe: "פתיחת CRM", labelEn: "Open CRM", labelRu: "Открыть CRM", keywords: ["לקוחות", "crm"] },
  { id: "open_project_board", labelHe: "לוח פרויקטים", labelEn: "Project board", labelRu: "Доска проектов", keywords: ["פרויקטים", "לוח", "board"] },
  { id: "open_erp_archive", labelHe: "ארכיון ERP", labelEn: "ERP archive", labelRu: "Архив ERP", keywords: ["ארכיון", "erp"] },
  { id: "open_dashboard", labelHe: "דאשבורד", labelEn: "Dashboard", labelRu: "Панель", keywords: ["דאשבורד", "dashboard"] },
  { id: "meckano_clock_in", labelHe: "כניסה למקאנו", labelEn: "Clock in", labelRu: "Вход Meckano", keywords: ["כניסה", "clock in"] },
  { id: "meckano_clock_out", labelHe: "יציאה ממקאנו", labelEn: "Clock out", labelRu: "Выход Meckano", keywords: ["יציאה", "clock out"] },
  { id: "open_meckano_reports", labelHe: "דוחות מקאנו", labelEn: "Meckano reports", labelRu: "Отчёты Meckano", keywords: ["מקאנו", "דוחות"] },
  { id: "open_notebook", labelHe: "NotebookLM", labelEn: "NotebookLM", labelRu: "NotebookLM", keywords: ["מחברת", "notebook"] },
  { id: "open_ai_chat", labelHe: "צ'אט AI", labelEn: "AI chat", labelRu: "AI чат", keywords: ["צ'אט", "chat", "ai"] },
  { id: "google_assistant_command", labelHe: "Google Assistant", labelEn: "Google Assistant", labelRu: "Google Assistant", keywords: ["google", "עוזר"] },
  { id: "open_google_drive", labelHe: "Google Drive", labelEn: "Google Drive", labelRu: "Google Drive", keywords: ["drive", "דרייב"] },
  { id: "open_settings", labelHe: "הגדרות", labelEn: "Settings", labelRu: "Настройки", keywords: ["הגדרות", "settings"] },
  { id: "clear_layout", labelHe: "ניקוי פריסה", labelEn: "Clear layout", labelRu: "Очистить раскладку", keywords: ["נקה", "clear", "אפס"] },
  { id: "switch_window", labelHe: "מחליף חלונות", labelEn: "Window switcher", labelRu: "Переключатель окон", keywords: ["חלונות", "windows", "tab"] },
  { id: "clean_dashboard", labelHe: "דשבורד נקי", labelEn: "Clean dashboard", labelRu: "Чистая панель", keywords: ["נקי", "clean dashboard"] },
  { id: "open_accessibility", labelHe: "נגישות", labelEn: "Accessibility", labelRu: "Доступность", keywords: ["נגישות", "accessibility"] },
  { id: "close_widget", labelHe: "סגירת חלון", labelEn: "Close window", labelRu: "Закрыть окно", keywords: ["סגור", "close"] },
  { id: "focus_widget", labelHe: "מיקוד חלון", labelEn: "Focus window", labelRu: "Фокус окна", keywords: ["מיקוד", "focus"] },
  { id: "toggle_maximize", labelHe: "מקסום חלון", labelEn: "Maximize window", labelRu: "Развернуть окно", keywords: ["מקסום", "maximize"] },
  { id: "edit_issued_document", labelHe: "עריכת מסמך", labelEn: "Edit document", labelRu: "Редактировать документ", keywords: ["ערוך", "edit document"] },
  { id: "delete_issued_document", labelHe: "מחיקת מסמך", labelEn: "Delete document", labelRu: "Удалить документ", keywords: ["מחק", "delete document"] },
  { id: "export_document", labelHe: "ייצוא מסמך", labelEn: "Export document", labelRu: "Экспорт документа", keywords: ["ייצוא", "export", "pdf"] },
  { id: "assign_document_project", labelHe: "שיוך לפרויקט", labelEn: "Assign to project", labelRu: "Привязать к проекту", keywords: ["שייך", "assign project"] },
  { id: "show_scan_preview", labelHe: "תצוגת סריקה", labelEn: "Scan preview", labelRu: "Предпросмотр скана", keywords: ["תצוגה", "preview"] },
  { id: "show_scan_results", labelHe: "תוצאות סריקה", labelEn: "Scan results", labelRu: "Результаты скана", keywords: ["תוצאות", "results"] },
  { id: "confirm_scan_to_erp", labelHe: "אישור ל-ERP", labelEn: "Confirm to ERP", labelRu: "Подтвердить в ERP", keywords: ["אישור", "erp confirm"] },
  { id: "search_client", labelHe: "חיפוש לקוח", labelEn: "Search client", labelRu: "Поиск клиента", keywords: ["חפש לקוח", "search client"] },
  { id: "open_project", labelHe: "פתיחת פרויקט", labelEn: "Open project", labelRu: "Открыть проект", keywords: ["פרויקט", "project"] },
];

const INTENT_SET = new Set(AUTOMATION_CATALOG.map((e) => e.id));

export function normalizeAutomationIntent(raw: string): AutomationIntent | null {
  const key = raw.trim() as AutomationIntent;
  return INTENT_SET.has(key) ? key : null;
}

function labelForLocale(entry: AutomationCatalogEntry, locale: AppLocale): string {
  if (locale === "en") return entry.labelEn;
  if (locale === "ru") return entry.labelRu;
  return entry.labelHe;
}

export function automationCatalogForPrompt(locale?: string): string {
  const loc = normalizeLocale(locale) as AppLocale;
  return AUTOMATION_CATALOG.map((e) => `- ${e.id}: ${labelForLocale(e, loc)} (keywords: ${e.keywords.slice(0, 5).join(", ")})`).join("\n");
}

export const AUTOMATION_INTENT_ENUM = AUTOMATION_CATALOG.map((e) => e.id);
