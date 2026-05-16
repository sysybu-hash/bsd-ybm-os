import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";

export type ApiMessageKey =
  | "missing_message"
  | "no_org"
  | "gemini_not_configured"
  | "no_organization"
  | "rate_limited"
  | "missing_project_id"
  | "missing_messages"
  | "project_not_found"
  | "notebook_not_found"
  | "no_sources"
  | "empty_script"
  | "voice_org_only"
  | "server_error"
  | "unassigned_client";

const MESSAGES: Record<AppLocale, Record<ApiMessageKey, string>> = {
  he: {
    missing_message: "חסרה הודעה",
    no_org: "לא נמצא ארגון במסגרת המשתמש",
    gemini_not_configured: "Gemini לא מוגדר. הגדירו GOOGLE_GENERATIVE_AI_API_KEY או GEMINI_API_KEY.",
    no_organization: "נדרש ארגון (organizationId) לשיחה לפי פרויקט.",
    rate_limited: "הגבלת קצב. נסו שוב מאוחר יותר.",
    missing_project_id: "חסר projectId.",
    missing_messages: "חסרות הודעות (messages).",
    project_not_found: "הפרויקט לא נמצא או אינו שייך לארגון.",
    notebook_not_found: "המחברת לא נמצאה.",
    no_sources: "הוסף מקורות לפני יצירת סקירה קולית.",
    empty_script: "לא נוצר תסריט.",
    voice_org_only: "העוזר הקולי זמין רק למשתמשים המשויכים לארגון.",
    server_error: "שגיאת שרת.",
    unassigned_client: "לא שויך",
  },
  en: {
    missing_message: "Message is required",
    no_org: "No organization found for this user",
    gemini_not_configured: "Gemini is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY or GEMINI_API_KEY.",
    no_organization: "An organization (organizationId) is required for project chat.",
    rate_limited: "Rate limit exceeded. Please try again later.",
    missing_project_id: "projectId is required.",
    missing_messages: "messages array is required.",
    project_not_found: "Project not found or does not belong to this organization.",
    notebook_not_found: "Notebook not found.",
    no_sources: "Add sources before creating an audio overview.",
    empty_script: "No script was generated.",
    voice_org_only: "Voice assistant is only available for users linked to an organization.",
    server_error: "Server error.",
    unassigned_client: "Unassigned",
  },
  ru: {
    missing_message: "Требуется сообщение",
    no_org: "Организация для пользователя не найдена",
    gemini_not_configured: "Gemini не настроен. Укажите GOOGLE_GENERATIVE_AI_API_KEY или GEMINI_API_KEY.",
    no_organization: "Для чата по проекту нужен organizationId.",
    rate_limited: "Превышен лимит запросов. Повторите позже.",
    missing_project_id: "Требуется projectId.",
    missing_messages: "Требуется массив messages.",
    project_not_found: "Проект не найден или не принадлежит организации.",
    notebook_not_found: "Блокнот не найден.",
    no_sources: "Добавьте источники перед созданием аудиообзора.",
    empty_script: "Сценарий не был создан.",
    voice_org_only: "Голосовой помощник доступен только пользователям с организацией.",
    server_error: "Ошибка сервера.",
    unassigned_client: "Не назначен",
  },
};

export function getApiMessage(key: ApiMessageKey, locale?: string | null): string {
  const loc = normalizeLocale(locale ?? undefined);
  return MESSAGES[loc]?.[key] ?? MESSAGES.en[key];
}
