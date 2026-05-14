/**
 * פרטי זיהוי לאתר המשפטי — עדכן דרך משתני סביבה בפרודקשן (Vercel).
 * אין כאן ייעוץ משפטי; הנוסחים למילוי ואימות מול יועץ / DPO.
 */
function envStr(key: string): string | undefined {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

export const legalSite = {
  siteName: "BSD-YBM Intelligence",
  /** שם מפעיל / חברה */
  operatorDisplayName: envStr("NEXT_PUBLIC_LEGAL_ENTITY_NAME") ?? "יוחנן בוקשפן",
  /** מזהה רישום (ח.פ. / עוסק מורשה) — אופציונלי */
  entityRegistrationId: envStr("NEXT_PUBLIC_LEGAL_ENTITY_ID"),
  /** כתובת רשומה / משרדים — חובה למלא בפרודקשן לצורכי שקיפות GDPR */
  registeredAddress:
    envStr("NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS") ??
    "[יש למלא: כתובת רשומה / מיקום מפעיל — NEXT_PUBLIC_LEGAL_REGISTERED_ADDRESS]",
  /** כתובת אתר רשמית */
  publicUrl: "https://www.bsd-ybm.co.il",
  /** אימייל לפניות משפטיות ו-GDPR */
  contactEmail:
    envStr("NEXT_PUBLIC_LEGAL_CONTACT_EMAIL") ?? "yb@bsd-ybm.co.il",
  /** נציג הגנת מידע באיחוד (מאמר 27 GDPR) — אם חל */
  euRepresentative:
    envStr("NEXT_PUBLIC_EU_REPRESENTATIVE") ??
    "[אם חל — פרטי נציג באיחוד; אחרת ציון \"לא חל\" לאחר בדיקת יועץ]",
  /** תאריך עדכון אחרון של מסמכים (מחרוזת להצגה) */
  documentsLastUpdated: "אפריל 2026",
} as const;
