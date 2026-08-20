import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";
import { negotiateLocale } from "@/lib/i18n/negotiate";

export type ApiErrorKey =
  | "ita_allocation_request_failed"
  | "ita_not_configured"
  | "ita_api_inactive"
  | "ita_allocation_failed"
  | "schedule_missing_file"
  | "schedule_mpp_not_configured"
  | "schedule_mpp_unreachable"
  | "schedule_mpp_failed"
  | "schedule_mpp_invalid_response"
  | "schedule_unsupported_format"
  | "document_number_allocation_failed";

const MESSAGES: Record<AppLocale, Record<ApiErrorKey, string>> = {
  he: {
    ita_allocation_request_failed: "בקשת מספר הקצאה לרשות המסים נכשלה",
    ita_not_configured:
      "נדרש מספר הקצאה מרשות המסים, אך המערכת אינה מחוברת ל-ITA. הגדירו ITA_PRODUCTION_KEY או פנו לתמיכה.",
    ita_api_inactive:
      "חיבור רשות המסים מוגדר אך ה-API הרשמי עדיין לא פעיל במערכת. לא ניתן להנפיק מסמך מעל סף ההקצאה.",
    ita_allocation_failed: "בקשת מספר הקצאה נכשלה",
    schedule_missing_file: "לא נמצא קובץ לוח זמנים",
    schedule_mpp_not_configured:
      "ייבוא MPP דורש שירות המרה. הגדירו MPP_CONVERT_URL (POST multipart → XML) או ייצאו ל-XML/CSV מ-MS Project.",
    schedule_mpp_unreachable: "שירות המרת MPP לא זמין.",
    schedule_mpp_failed: "המרת MPP נכשלה. בדקו את שירות MPP_CONVERT_URL.",
    schedule_mpp_invalid_response: "שירות ההמרה לא החזיר XML תקין.",
    schedule_unsupported_format: "פורמט לא נתמך — השתמשו ב-XML או CSV",
    document_number_allocation_failed: "לא ניתן היה להקצות מספר מסמך.",
  },
  en: {
    ita_allocation_request_failed: "Tax Authority allocation number request failed",
    ita_not_configured:
      "An ITA allocation number is required, but the system is not connected to ITA. Set ITA_PRODUCTION_KEY or contact support.",
    ita_api_inactive:
      "ITA is configured but the official API is not active yet. Cannot issue a document above the allocation threshold.",
    ita_allocation_failed: "Allocation number request failed",
    schedule_missing_file: "No schedule file was provided",
    schedule_mpp_not_configured:
      "MPP import requires a converter service. Set MPP_CONVERT_URL (POST multipart → XML) or export to XML/CSV from MS Project.",
    schedule_mpp_unreachable: "MPP converter service is unavailable.",
    schedule_mpp_failed: "MPP conversion failed. Check the MPP_CONVERT_URL service.",
    schedule_mpp_invalid_response: "Converter service did not return valid XML.",
    schedule_unsupported_format: "Unsupported format — use XML or CSV",
    document_number_allocation_failed: "Could not allocate a document number.",
  },
  ru: {
    ita_allocation_request_failed: "Не удалось запросить номер выделения у налоговой",
    ita_not_configured:
      "Требуется номер выделения ITA, но система не подключена к ITA. Укажите ITA_PRODUCTION_KEY или обратитесь в поддержку.",
    ita_api_inactive:
      "ITA настроена, но официальный API ещё не активен. Нельзя выпустить документ выше порога выделения.",
    ita_allocation_failed: "Запрос номера выделения не удался",
    schedule_missing_file: "Файл расписания не найден",
    schedule_mpp_not_configured:
      "Импорт MPP требует сервис конвертации. Укажите MPP_CONVERT_URL (POST multipart → XML) или экспортируйте XML/CSV из MS Project.",
    schedule_mpp_unreachable: "Сервис конвертации MPP недоступен.",
    schedule_mpp_failed: "Конвертация MPP не удалась. Проверьте сервис MPP_CONVERT_URL.",
    schedule_mpp_invalid_response: "Сервис конвертации вернул невалидный XML.",
    schedule_unsupported_format: "Неподдерживаемый формат — используйте XML или CSV",
    document_number_allocation_failed: "Не удалось назначить номер документа.",
  },
};

const MPP_CODE_TO_KEY: Record<string, ApiErrorKey> = {
  mpp_converter_not_configured: "schedule_mpp_not_configured",
  mpp_converter_unreachable: "schedule_mpp_unreachable",
  mpp_converter_failed: "schedule_mpp_failed",
  mpp_converter_invalid_response: "schedule_mpp_invalid_response",
};

/** Resolve locale from explicit param or Accept-Language (defaults to he). */
export function resolveApiLocale(
  acceptLanguage?: string | null,
  localeParam?: string | null,
): AppLocale {
  if (localeParam?.trim()) {
    return normalizeLocale(localeParam);
  }
  return negotiateLocale(acceptLanguage);
}

export function resolveApiLocaleFromRequest(req: Request): AppLocale {
  const url = new URL(req.url);
  return resolveApiLocale(req.headers.get("accept-language"), url.searchParams.get("locale"));
}

export function getApiErrorMessage(key: ApiErrorKey, locale?: string | null): string {
  const loc = normalizeLocale(locale ?? undefined);
  return MESSAGES[loc]?.[key] ?? MESSAGES.en[key];
}

/** Map MppConvertError.code (or similar) to a localized API error message. */
export function getMppApiErrorMessage(code: string, locale?: string | null): string {
  const key = MPP_CODE_TO_KEY[code];
  if (key) return getApiErrorMessage(key, locale);
  return getApiErrorMessage("schedule_mpp_failed", locale);
}

export function isApiErrorKey(value: string): value is ApiErrorKey {
  return value in MESSAGES.he;
}
