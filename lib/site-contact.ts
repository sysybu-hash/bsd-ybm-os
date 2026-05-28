import { normalizeLocale, type AppLocale } from "@/lib/i18n/config";

/** פרטי קשר רשמיים של המערכת — מקור אחד לדף הבית, פוטר, משפטי ו-AI */
export const SITE_CONTACT = {
  email: "yb@bsd-ybm.co.il",
  phone: {
    e164: "+972525640021",
    /** מספר ל־wa.me (ללא +) */
    waMe: "972525640021",
    display: {
      he: "052-564-0021",
      en: "+972 52-564-0021",
      ru: "+972 52-564-0021",
    },
  },
  address: {
    he: "גבעת זאב, ישראל",
    en: "Givat Ze'ev, Israel",
    ru: "Гиват Зеэв, Израиль",
  },
  availability: {
    he: "זמינות: 24/6 (לא כולל שבתות וחגים)",
    en: "Availability: 24/6 (excluding Shabbat and Jewish holidays)",
    ru: "Доступность: 24/6 (кроме шабата и еврейских праздников)",
  },
} as const;

export function siteContactAddress(locale: string): string {
  const loc: AppLocale = normalizeLocale(locale);
  return SITE_CONTACT.address[loc] ?? SITE_CONTACT.address.he;
}

export function siteContactAvailability(locale: string): string {
  const loc: AppLocale = normalizeLocale(locale);
  return SITE_CONTACT.availability[loc] ?? SITE_CONTACT.availability.he;
}

export function siteContactPhoneDisplay(locale: string): string {
  const loc: AppLocale = normalizeLocale(locale);
  return SITE_CONTACT.phone.display[loc] ?? SITE_CONTACT.phone.display.he;
}

export function siteContactWhatsAppUrl(): string {
  return `https://wa.me/${SITE_CONTACT.phone.waMe}`;
}
