/**
 * ערכי ברירת מחדל לשדות AI/מסמך כשאין נתונים — מיושרים למסך ERP תחת `app/app/erp/page.tsx`.
 * התצוגה מתורגמת ב־UI; הערך המאוחסן נשאר יציב לסינון ולשמירה.
 */
export const DOC_UI_FALLBACK = {
  unknownVendor: "ספק לא זוהה",
  noSummary: "עדיין אין תקציר זמין למסמך הזה.",
  unknownDocType: "סוג מסמך לא זוהה",
} as const;
