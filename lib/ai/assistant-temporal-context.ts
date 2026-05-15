import { widgetCatalogForPrompt } from "@/lib/os-assistant/widget-catalog";

const ISRAEL_TZ = "Asia/Jerusalem";

/** תאריך ושעה נוכחיים לפי שעון ישראל — לשימוש בפרומפטים */
export function getAssistantNowDisplayHe(): string {
  const now = new Date();
  const date = new Intl.DateTimeFormat("he-IL", {
    timeZone: ISRAEL_TZ,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("he-IL", {
    timeZone: ISRAEL_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  return `${date}, שעה ${time} (Asia/Jerusalem)`;
}

export function getAssistantNowIso(): string {
  return new Date().toISOString();
}

/** כללי עדכניות — מוצמדים לכל עוזר במערכת */
export function getAssistantTemporalRulesBlockHe(): string {
  const nowDisplay = getAssistantNowDisplayHe();
  const nowIso = getAssistantNowIso();
  return [
    "## תאריך ושעה נוכחיים (שרת BSD-YBM)",
    `- תצוגה: ${nowDisplay}`,
    `- ISO (UTC): ${nowIso}`,
    "",
    "## כללי עדכניות",
    "- בכל תשובה שבה חשוב זמן (מועדים, «היום», «השבוע», דוחות, סטטוס) — ציין במפורש את התאריך/השעה למעלה.",
    "- על BSD-YBM OS, ווידג'טים, כפתורים ונתיבים באתר: הסתמך על קטלוג המערכת למטה ועל נתוני ההקשר (JSON) שנמסרו; אל תמציא תכונות שלא מופיעות שם.",
    "- על נתוני הארגון (לקוחות, פרויקטים, מסמכים): השתמש רק במה שסופק בהקשר; אם חסר — הצע לפתוח ווידג'ט או לחפש במערכת.",
    "- על ידע כללי חיצוני (חוק, מחירי שוק, חדשות): אם לא סופק מקור חיצוני בזמן אמת — ציין שהמידע מבוסס ידע המודל נכון לתאריך למעלה ושכדאי לאמת במקור רשמי; אל תטען שביצעת חיפוש באינטרנט עכשיו.",
  ].join("\n");
}

export function getBsdYbmSiteCapabilitiesBlockHe(): string {
  return [
    "## קטלוג BSD-YBM OS (ממשק נוכחי)",
    widgetCatalogForPrompt(),
    "",
    "דפים ציבוריים: / (נחיתה), /login, /about, /privacy, /terms, /legal.",
    "ממשק מחובר: סיידבר ודוק לפתיחת ווידג'טים, Omnibar (חיפוש/פקודות), פעמון התראות, מצב «דשבורד נקי», שמירת פריסת חלונות, החלפת שפה וערכת בהיר/כהה.",
  ].join("\n");
}

/** מצרף תאריך, כללים וקטלוג אתר לכל הוראת מערכת */
export function withAssistantTemporalContext(systemBlock: string): string {
  const trimmed = systemBlock.trim();
  return [
    getAssistantTemporalRulesBlockHe(),
    getBsdYbmSiteCapabilitiesBlockHe(),
    trimmed ? `---\n${trimmed}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}
