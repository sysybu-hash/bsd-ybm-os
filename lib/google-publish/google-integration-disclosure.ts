import type { AppLocale } from "@/lib/i18n/config";
import { legalSite } from "@/lib/legal-site";

export type GoogleIntegrationSection = { heading: string; body: string };

export type GoogleIntegrationDoc = {
  title: string;
  lead: string;
  sections: GoogleIntegrationSection[];
  revokeNote: string;
};

const GOOGLE_ACCOUNT_PERMISSIONS_URL = "https://myaccount.google.com/permissions";

const DOCS: Record<AppLocale, GoogleIntegrationDoc> = {
  he: {
    title: "שילוב Google (התחברות ו-Google Drive)",
    lead: `${legalSite.siteName} משתמשת ב-Google OAuth לצורך התחברות מאובטחת ולחיבור אופציונלי ל-Google Drive של הארגון. עמוד זה מפרט אילו הרשאות נדרשות, למה, ואיך לבטל גישה.`,
    sections: [
      {
        heading: "הרשאות OAuth שבשימוש",
        body: [
          "התחברות (Sign in with Google): openid, email, profile — לזיהוי המשתמש ויצירת/קישור חשבון.",
          "Google Drive (https://www.googleapis.com/auth/drive): גישה לקבצים ותיקיות ב-Drive של המשתמש שאישר את החיבור, במסגרת תכונות המערכת בלבד.",
        ].join(" "),
      },
      {
        heading: "למה נדרשת גישה מלאה ל-Drive",
        body:
          "המערכת מסנכרנת תיקיית עבודה ייעודית (למשל BSD-YBM), מציגה קבצים ברשימה/רשת, מאפשרת העלאה ופענוח מסמכים (חשבוניות, הצעות) ל-ERP. Scope מצומצם (drive.file) אינו מספיק לסנכרון תיקייה קיימת ולניהול מבנה תיקיות — לכן נדרש scope מלא, בהתאם למדיניות Google לסקופים מוגבלים.",
      },
      {
        heading: "אילו נתונים נגישים ונשמרים",
        body:
          "מטא-דאנים של קבצים (שם, מזהה, סוג, תאריך), תוכן קבצים שנבחרו לעיבוד/העלאה/פענוח, ורשומות סנכרון בבסיס הנתונים שלנו. לא משתמשים בנתוני Drive לפרסום, למכירה לצדדים שלישיים, או לפרופיל פרסומי.",
      },
      {
        heading: "איך מבטלים גישה",
        body: [
          `בתוך המערכת: הגדרות → אינטגרציות → ניתוק Google Drive / התנתקות.`,
          `בחשבון Google: ${GOOGLE_ACCOUNT_PERMISSIONS_URL} — הסרת גישה לאפליקציה "${legalSite.siteName}".`,
          `למחיקת נתונים שנשמרו אצלנו: פנייה ל-${legalSite.contactEmail} (זכויות GDPR — ראו מדיניות פרטיות).`,
        ].join(" "),
      },
      {
        heading: "אבטחה ושיתוף עם Google",
        body:
          "התקשורת עם Google מתבצעת ב-HTTPS. אנו לא מעבירים ל-Google תוכן מסמכים לצורכי פרסום. עיבוד AI (סריקה/פענוח) עשוי להיעשות דרך ספקי ענן נוספים לפי מדיניות הפרטיות הכללית.",
      },
    ],
    revokeNote: "קישור להסרת הרשאות בחשבון Google",
  },
  en: {
    title: "Google integration (Sign-in & Drive)",
    lead: `${legalSite.siteName} uses Google OAuth for secure sign-in and optional Google Drive connection per organization. This page describes scopes, purposes, and how to revoke access.`,
    sections: [
      {
        heading: "OAuth scopes in use",
        body: "Sign-in: openid, email, profile. Google Drive: https://www.googleapis.com/auth/drive — access files and folders the user authorized, only for in-app features.",
      },
      {
        heading: "Why full Drive scope",
        body:
          "We sync a dedicated workspace folder, list/upload files, and decode documents into ERP. Restricted drive.file scope cannot manage an existing folder tree — full Drive scope is required per Google restricted-scope policy.",
      },
      {
        heading: "Data accessed and stored",
        body:
          "File metadata and content you process; sync records in our database. We do not sell Drive data or use it for ads.",
      },
      {
        heading: "How to revoke",
        body: `Disconnect in app settings, or remove the app at ${GOOGLE_ACCOUNT_PERMISSIONS_URL}. Data deletion requests: ${legalSite.contactEmail} (see Privacy Policy).`,
      },
      {
        heading: "Security",
        body: "All Google API calls use HTTPS. Document AI processing may use additional cloud processors as described in the Privacy Policy.",
      },
    ],
    revokeNote: "Remove access in your Google Account",
  },
  ru: {
    title: "Интеграция Google (вход и Drive)",
    lead: `${legalSite.siteName} использует Google OAuth для входа и опционального подключения Google Drive.`,
    sections: [
      {
        heading: "Используемые scope",
        body: "Вход: openid, email, profile. Google Drive: полный доступ drive для синхронизации папки и документов в рамках функций приложения.",
      },
      {
        heading: "Зачем полный Drive",
        body: "Синхронизация рабочей папки, загрузка и распознавание документов; узкий scope drive.file недостаточен.",
      },
      {
        heading: "Данные",
        body: "Метаданные и содержимое обрабатываемых файлов; записи синхронизации у нас. Не продаём данные Drive.",
      },
      {
        heading: "Отзыв доступа",
        body: `Настройки приложения или ${GOOGLE_ACCOUNT_PERMISSIONS_URL}. Удаление данных: ${legalSite.contactEmail}.`,
      },
      {
        heading: "Безопасность",
        body: "HTTPS; обработка AI — см. Политику конфиденциальности.",
      },
    ],
    revokeNote: "Удалить доступ в аккаунте Google",
  },
};

export function getGoogleIntegrationDoc(locale: AppLocale): GoogleIntegrationDoc {
  return DOCS[locale] ?? DOCS.he;
}

export { GOOGLE_ACCOUNT_PERMISSIONS_URL };
