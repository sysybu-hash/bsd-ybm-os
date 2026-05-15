import type { AppLocale } from "@/lib/i18n/config";
import { legalSite } from "@/lib/legal-site";
import { getCanonicalSiteUrl } from "@/lib/site-metadata";

export type LocalizedSeo = {
  title: string;
  description: string;
  keywords: string[];
  ogLocale: string;
};

const SEO: Record<AppLocale, LocalizedSeo> = {
  he: {
    title: "BSD-YBM OS | מערכת תפעול חכמה לעסקי בנייה וקבלנים",
    description:
      `${legalSite.siteName} — CRM, ERP, סריקת מסמכים ב-AI, חיוב ודוחות במקום אחד. מיועד לעסקים מקצועיים בישראל.`,
    keywords: [
      "BSD-YBM",
      "מערכת ניהול",
      "CRM",
      "ERP",
      "בנייה",
      "סריקת חשבוניות",
      "AI",
    ],
    ogLocale: "he_IL",
  },
  en: {
    title: "BSD-YBM OS | Smart operations for construction businesses",
    description:
      `${legalSite.siteName} — CRM, ERP, AI document scanning, billing and reports in one workspace for professional contractors.`,
    keywords: [
      "BSD-YBM",
      "construction software",
      "CRM",
      "ERP",
      "AI invoice scan",
      "Israel",
    ],
    ogLocale: "en_US",
  },
  ru: {
    title: "BSD-YBM OS | Умная система для строительного бизнеса",
    description:
      `${legalSite.siteName} — CRM, ERP, AI-сканирование документов, биллинг и отчёты в одной рабочей среде.`,
    keywords: [
      "BSD-YBM",
      "строительство",
      "CRM",
      "ERP",
      "сканирование документов",
    ],
    ogLocale: "ru_RU",
  },
};

export function getLocalizedSeo(locale: AppLocale): LocalizedSeo {
  return SEO[locale] ?? SEO.he;
}

export function getHreflangAlternates(): Record<string, string> {
  const base = getCanonicalSiteUrl().replace(/\/$/, "");
  return {
    "he-IL": `${base}/`,
    en: `${base}/`,
    ru: `${base}/`,
    "x-default": `${base}/`,
  };
}

export type PublicPageId = "about" | "privacy" | "terms" | "legal" | "login";

const PAGE_SEO: Record<PublicPageId, Record<AppLocale, { title: string; description: string }>> = {
  about: {
    he: {
      title: "אודות",
      description: "מי אנחנו, מה עושה BSD-YBM OS ולמי המערכת מיועדת — עסקי בנייה וקבלנים בישראל.",
    },
    en: {
      title: "About",
      description: "About BSD-YBM OS — CRM, ERP, AI document scanning for construction businesses.",
    },
    ru: {
      title: "О нас",
      description: "О BSD-YBM OS — CRM, ERP и AI-сканирование для строительного бизнеса.",
    },
  },
  privacy: {
    he: { title: "מדיניות פרטיות", description: "מדיניות פרטיות ו-GDPR של BSD-YBM OS." },
    en: { title: "Privacy Policy", description: "Privacy policy and GDPR information for BSD-YBM OS." },
    ru: { title: "Конфиденциальность", description: "Политика конфиденциальности BSD-YBM OS." },
  },
  terms: {
    he: { title: "תנאי שימוש", description: "תנאי שימוש במערכת BSD-YBM OS." },
    en: { title: "Terms of Service", description: "Terms of use for BSD-YBM OS." },
    ru: { title: "Условия", description: "Условия использования BSD-YBM OS." },
  },
  legal: {
    he: { title: "מידע משפטי", description: "פרטי מפעיל, יצירת קשר ושקיפות משפטית." },
    en: { title: "Legal", description: "Operator details, contact and legal transparency." },
    ru: { title: "Правовая информация", description: "Оператор, контакты и юридическая информация." },
  },
  login: {
    he: { title: "התחברות", description: "התחברות מאובטחת ל-BSD-YBM OS עם Google." },
    en: { title: "Sign in", description: "Secure sign-in to BSD-YBM OS with Google." },
    ru: { title: "Вход", description: "Безопасный вход в BSD-YBM OS через Google." },
  },
};

export function getPublicPageSeo(locale: AppLocale, page: PublicPageId): LocalizedSeo {
  const base = getLocalizedSeo(locale);
  const pageMeta = PAGE_SEO[page][locale] ?? PAGE_SEO[page].he;
  return {
    ...base,
    title: `${pageMeta.title} | BSD-YBM OS`,
    description: pageMeta.description,
  };
}
