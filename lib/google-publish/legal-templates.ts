import type { AppLocale } from "@/lib/i18n/config";
import { legalSite } from "@/lib/legal-site";

export type LegalDocKind = "privacy" | "terms" | "legal";

type Section = { heading: string; body: string };

type LegalDoc = { title: string; intro: string; sections: Section[] };

function operatorBlock(locale: AppLocale): string {
  const name = legalSite.operatorDisplayName;
  const addr = legalSite.registeredAddress;
  const email = legalSite.contactEmail;
  if (locale === "en") {
    return `Operator: ${name}. Registered address: ${addr}. Contact: ${email}.`;
  }
  if (locale === "ru") {
    return `Оператор: ${name}. Адрес: ${addr}. Контакт: ${email}.`;
  }
  return `מפעיל: ${name}. כתובת: ${addr}. לפניות: ${email}.`;
}

const DOCS: Record<LegalDocKind, Record<AppLocale, LegalDoc>> = {
  privacy: {
    he: {
      title: "מדיניות פרטיות",
      intro: `עודכן לאחרונה: ${legalSite.documentsLastUpdated}. ${operatorBlock("he")}`,
      sections: [
        {
          heading: "איזה מידע אנו אוספים",
          body: "פרטי חשבון (שם, אימייל), נתוני ארגון, מסמכים שהעליתם, יומני שימוש ועוגיות הכרחיות/אנליטיקה (בהסכמה).",
        },
        {
          heading: "מטרות עיבוד",
          body: "מתן השירות, אבטחה, תמיכה, שיפור המוצר, עמידה בחובות חוק. בסיס חוקי: ביצוע חוזה, אינטרס לגיטימי והסכמה כנדרש.",
        },
        {
          heading: "שיתוף ושמירה",
          body: "ספקי ענן (אירוח, AI, אחסון) תחת הסכמים מתאימים. שמירה לפי צורך השירות וחוק. לא מוכרים מידע אישי.",
        },
        {
          heading: "זכויותיך (GDPR)",
          body: "גישה, תיקון, מחיקה, הגבלה, ניידות והתנגדות — בפנייה ל-contactEmail. נציג באיחוד: " + legalSite.euRepresentative,
        },
        {
          heading: "עוגיות",
          body: "ניהול העדפות דרך מסך ההסכמה באתר. עוגיות הכרחיות לפעולת המערכת.",
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro: `Last updated: ${legalSite.documentsLastUpdated}. ${operatorBlock("en")}`,
      sections: [
        {
          heading: "Data we collect",
          body: "Account details, organization data, uploaded documents, usage logs, and cookies (with consent where required).",
        },
        {
          heading: "Purposes & legal bases",
          body: "Service delivery, security, support, product improvement, legal compliance. Contract, legitimate interest, and consent as applicable.",
        },
        {
          heading: "Processors & retention",
          body: "Cloud hosting and AI providers under appropriate agreements. Retention aligned with service needs and law.",
        },
        {
          heading: "Your rights (GDPR)",
          body: `Access, rectification, erasure, restriction, portability, objection — contact ${legalSite.contactEmail}. EU representative: ${legalSite.euRepresentative}`,
        },
        { heading: "Cookies", body: "Manage preferences via the on-site consent banner." },
      ],
    },
    ru: {
      title: "Политика конфиденциальности",
      intro: `Обновлено: ${legalSite.documentsLastUpdated}. ${operatorBlock("ru")}`,
      sections: [
        {
          heading: "Какие данные собираем",
          body: "Учётная запись, данные организации, загруженные документы, журналы использования, cookie (с согласия).",
        },
        {
          heading: "Цели обработки",
          body: "Оказание услуг, безопасность, поддержка, улучшение продукта, соблюдение закона.",
        },
        {
          heading: "Передача и хранение",
          body: "Облачные провайдеры по договорам. Хранение по необходимости сервиса.",
        },
        {
          heading: "Права (GDPR)",
          body: `Доступ, исправление, удаление — ${legalSite.contactEmail}. Представитель в ЕС: ${legalSite.euRepresentative}`,
        },
        { heading: "Cookie", body: "Управление через баннер согласия на сайте." },
      ],
    },
  },
  terms: {
    he: {
      title: "תנאי שימוש",
      intro: operatorBlock("he"),
      sections: [
        { heading: "קבלת התנאים", body: "שימוש במערכת מהווה הסכמה לתנאים אלה." },
        { heading: "חשבון ואחריות", body: "אתם אחראים לשמירת גישה מאובטחת ולשימוש חוקי." },
        { heading: "מנוי ותשלום", body: "תנאי מנוי ומכסות סריקה לפי התוכנית שנבחרה בארגון." },
        { heading: "קניין רוחני", body: "המערכת והמותג שייכים למפעיל. תוכן המשתמש נשאר בבעלותכם." },
        { heading: "הגבלת אחריות", body: "השירות ניתן כפי שהוא. אין אחריות לנזקים עקיפים במידה המותרת בחוק." },
      ],
    },
    en: {
      title: "Terms of Service",
      intro: operatorBlock("en"),
      sections: [
        { heading: "Acceptance", body: "Using the platform constitutes acceptance of these terms." },
        { heading: "Account", body: "You are responsible for secure access and lawful use." },
        { heading: "Subscription", body: "Plans, scan quotas, and billing per organization settings." },
        { heading: "IP", body: "Platform IP remains with the operator. Your content stays yours." },
        { heading: "Liability", body: "Service provided as-is within limits permitted by law." },
      ],
    },
    ru: {
      title: "Условия использования",
      intro: operatorBlock("ru"),
      sections: [
        { heading: "Принятие", body: "Использование сервиса означает согласие с условиями." },
        { heading: "Аккаунт", body: "Вы отвечаете за безопасный доступ и законное использование." },
        { heading: "Подписка", body: "Тарифы и лимиты сканирования по организации." },
        { heading: "ИС", body: "Платформа принадлежит оператору. Ваш контент остаётся вашим." },
        { heading: "Ответственность", body: "Сервис «как есть» в пределах закона." },
      ],
    },
  },
  legal: {
    he: {
      title: "מידע משפטי ושקיפות",
      intro: legalSite.publicUrl,
      sections: [
        { heading: "מפעיל", body: `${legalSite.operatorDisplayName}${legalSite.entityRegistrationId ? ` (${legalSite.entityRegistrationId})` : ""}` },
        { heading: "יצירת קשר", body: legalSite.contactEmail },
        { heading: "נציג GDPR באיחוד", body: legalSite.euRepresentative },
        { heading: "מסמכים", body: "מדיניות פרטיות, תנאי שימוש ומדיניות עוגיות זמינים באתר." },
      ],
    },
    en: {
      title: "Legal & transparency",
      intro: legalSite.publicUrl,
      sections: [
        { heading: "Operator", body: legalSite.operatorDisplayName },
        { heading: "Contact", body: legalSite.contactEmail },
        { heading: "EU GDPR representative", body: legalSite.euRepresentative },
        { heading: "Documents", body: "Privacy, Terms, and Cookie policy on this site." },
      ],
    },
    ru: {
      title: "Юридическая информация",
      intro: legalSite.publicUrl,
      sections: [
        { heading: "Оператор", body: legalSite.operatorDisplayName },
        { heading: "Контакт", body: legalSite.contactEmail },
        { heading: "Представитель в ЕС", body: legalSite.euRepresentative },
        { heading: "Документы", body: "Политика конфиденциальности и условия на сайте." },
      ],
    },
  },
};

export function getLegalDocument(kind: LegalDocKind, locale: AppLocale): LegalDoc {
  return DOCS[kind][locale] ?? DOCS[kind].he;
}
