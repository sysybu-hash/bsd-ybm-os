export type FeatureCard = { icon: string; title: string; desc: string };
export type Showcase = {
  file: string;
  num: string;
  kicker: string;
  title: string;
  desc: string;
  features: string[];
};

export const SHOWCASES: Showcase[] = [
  {
    file: "01-marketing-landing.png",
    num: "01",
    kicker: "הרושם הראשון",
    title: "אתר נחיתה שמספר את הסיפור",
    desc: "מיתוג מודרני, הסבר ערך בעברית RTL, וקריאה ברורה לפעולה — לפני שהלקוח אפילו פתח חשבון.",
    features: ["מצב כהה ובהיר", "מותאם למובייל", "תמיכה ב-3 שפות", "טעינה מהירה (Core Web Vitals ירוקים)"],
  },
  {
    file: "02-workspace-home.png",
    num: "02",
    kicker: "שולחן עבודה",
    title: "מערכת הפעלה לעסק",
    desc: "מסך הבית מציג Hub-ים, חלונות צפים וסרגל פעולות מהיר — כמו דסקטופ אמיתי בתוך הדפדפן.",
    features: [
      "Launcher מותאם אישית (גרירה ושינוי גודל)",
      "לשוניות כלי עזר: זמנים, מחשבון והמרת מטבע",
      "Omnibar — פקודות מהירות עם AI",
      "חלונות צפים שניתנים למיקסום ושינוי גודל",
    ],
  },
  {
    file: "14-utility-rail-calculator.png",
    num: "03",
    kicker: "כלי עזר",
    title: "זמנים, מחשבון והמרת מטבע — בלחיצה",
    desc: "לשוניות צפות בצד העבודה: זמני היום, מחשבון רגיל/מדעי עם מקלדת, וממיר מטבע בשערים חיים — נפתחות מעל התוכן בלי להזיז חלונות.",
    features: ["זמני היום והלוח העברי", "מחשבון + הקלדה במקלדת", "המרת מטבע (שערים חיים)", "Overlay — בלי דחיפת הפריסה"],
  },
  {
    file: "03-finance-hub.png",
    num: "04",
    kicker: "פיננסים",
    title: "בקרה פיננסית בזמן אמת",
    desc: "סה״כ הכנסות, רווח תפעולי, סטטוס הצעות מחיר וגרף הוצאות חודשי — והכל עם תובנות AI חיות.",
    features: ["KPI ראשיים: הכנסות / רווח / הוצאות", "AI Financial Intelligence — זיהוי חריגות", "סטטוס הצעות מחיר (ממתין/נחתם)", "ייצוא לרואה חשבון (CSV/PDF)"],
  },
  {
    file: "04-projects-hub.png",
    num: "05",
    kicker: "פרויקטים",
    title: "ניהול פרויקטים בלי אקסלים",
    desc: "בחירת פרויקט קלה, סטטוס פעיל/לא פעיל, ומעבר חלק ללוח המשימות, מרכז שליטה — או Field Copilot לעוזר AI בשטח.",
    features: ["לוח Kanban למשימות", "מרכז שליטה: תקציב, לוח זמנים, אבני דרך", "Field Copilot — עוזר AI שדה (analyze · handoff)", "קישור ישיר ל-CRM, מסמכים ויומן"],
  },
  {
    file: "05-crm-table.png",
    num: "06",
    kicker: "CRM",
    title: "לקוחות במרכז — מתויגים, חכמים, מחוברים",
    desc: "טבלת לקוחות מתקדמת עם חיפוש סמנטי, ייצוא/ייבוא CSV מהיר, timeline לכל איש קשר, וקישור אוטומטי לפרויקטים.",
    features: ["חיפוש סמנטי (לפי משמעות, לא רק מילה)", "ייצוא + ייבוא CSV דו-כיווני", "Timeline אינטראקציות מלא לכל לקוח", "תיוג, פילוח וקישור לפרויקטים"],
  },
  {
    file: "06-documents-hub.png",
    num: "07",
    kicker: "ארכיון ERP",
    title: "כל המסמכים שלך — מאורגנים אוטומטית",
    desc: "ארכיון מרכזי לחשבוניות, הצעות וחוזים — עם זיהוי OCR, תיוג אוטומטי לפי פרויקט, וחיפוש חופשי.",
    features: ["סריקת OCR (Google Document AI)", "חשבוניות, הצעות, חוזים, חתומים", "תיוג אוטומטי לפי פרויקט", "ייצוא בכמות גדולה"],
  },
  {
    file: "07-ai-hub.png",
    num: "08",
    kicker: "בינה מלאכותית",
    title: "AI Hub — צ'אט, מחברת ומחולל רעיונות",
    desc: "Hub אחד עם שלוש לשוניות: צ'אט ארגוני, מחברת AI ומחולל אפליקציות. תארו כל רעיון — טפסים, דשבורדים, Composer (KPIs + טופס + כפתורי פעולה) — או פקודות טבעיות ל-CRM, חשבוניות וסריקה.",
    features: ["צ'אט AI + Omnibar — פקודות בשפה חופשית", "מחברת AI לפרויקט — מקורות, תקציר, Gemini Live", "מנוע רעיונות — הפעלת CRM, משימות, סריקה מהצ'אט", "Gemini 2.5 — תשובות בעברית"],
  },
  {
    file: "13-app-builder.png",
    num: "09",
    kicker: "מחולל אפליקציות",
    title: "מחולל אפליקציות עם תצוגה מקדימה חיה",
    desc: "תארו כל רעיון בצ'אט — טפסים, דשבורדים, שעונים, מחשבונים — וקבלו תצוגה מקדימה אינטראקטיבית לצד עורך השיחה, עם שמירה ועריכה איטרטיבית.",
    features: ["תצוגה מקדימה חיה ב-iframe", "גלריית אפליקציות שמורות", "עריכה איטרטיבית בצ'אט", "Undo/Redo לקוד שנוצר"],
  },
  {
    file: "10-notebook-lm.png",
    num: "10",
    kicker: "מחברת חקירה",
    title: "NotebookLM משלך — בתוך הארגון",
    desc: "מחברות AI שמכירות את הקבצים שלך: PDF, Word, Excel, תמונות, JSON. שאלה בעברית — תשובה עם ציטוטים.",
    features: ["העלאת קבצים: PDF, Office, OpenDocument, תמונות", "מקורות ידע עם ציטוטים", "מפת חשיבה ותקציר אוטומטי", "סקירה קולית חיה (Gemini Live)"],
  },
  {
    file: "11-meckano-reports.png",
    num: "11",
    kicker: "שעות עבודה",
    title: "אינטגרציית Meckano — שעות בלי כפילויות",
    desc: "מושכים את שעות העובדים ישירות מ-Meckano, מסננים לפי פרויקט/תאריך, ומייצאים לרואה חשבון. סנכרון אוטומטי דרך cron.",
    features: ["סנכרון Meckano אוטומטי (cron)", "סינון לפי עובד/פרויקט/טווח", "ייצוא PDF ו-CSV", "חיבור ישיר למודול פרויקטים"],
  },
  {
    file: "12-google-calendar.png",
    num: "12",
    kicker: "יומן Google",
    title: "Google Calendar שמדבר עם הפרויקטים שלך",
    desc: "סנכרון דו-כיווני אוטומטי עם יומן Google: אירועים מהפרויקטים מוקפצים אוטומטית, וזמני פגישות חוזרים פנימה — בלי טעויות, בלי כפילויות.",
    features: ["OAuth + drive.file scope מאובטח", "סנכרון דו-כיווני (push + sync) דרך cron", "תצוגות חודש / שבוע / יום / agenda", "קישור ישיר לפרויקטים ולקוחות"],
  },
];

// Lucide-style SVG icons rendered inline (stroke-based, accent-colored)
export const ICONS = {
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  database: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>`,
  shieldCheck: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  bot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  creditCard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>`,
  hardHat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

export const TECH_STACK: FeatureCard[] = [
  { icon: ICONS.zap, title: "Next.js 15 + RSC", desc: "App Router, סטרימינג, ביצועים מתקדמים" },
  { icon: ICONS.database, title: "PostgreSQL (Neon)", desc: "Prisma 6, מיגרציות מנוהלות, גיבוי DR" },
  { icon: ICONS.shieldCheck, title: "Auth + Passkeys", desc: "NextAuth + SimpleWebAuthn, חיבור Google" },
  { icon: ICONS.bot, title: "AI רב-מודלי", desc: "Gemini 2.5, Claude, OpenAI, Groq" },
  { icon: ICONS.creditCard, title: "תשלומים", desc: "PayPal + PayPlus (ישראלי) + חשבוניות" },
  { icon: ICONS.activity, title: "ניטור Enterprise", desc: "Sentry, PostHog, Sentry Crons, Lighthouse CI" },
];

export const AUDIENCES: FeatureCard[] = [
  { icon: ICONS.hardHat, title: "קבלני בנייה", desc: "פרויקטים, שטח, מסמכים, תקציב — בענן" },
  { icon: ICONS.briefcase, title: "מנהלי פרויקטים", desc: "Kanban, אבני דרך, מחברת AI לכל פרויקט" },
  { icon: ICONS.wallet, title: "צוותי כספים", desc: "הפקת מסמכים, מע״מ, ייצוא לרואה חשבון" },
  { icon: ICONS.users, title: "בעלי עסקים", desc: "דשבורד KPI חי, התראות, AI שמדבר עברית" },
];

export const ACCENTS = [
  "#6366f1", // indigo
  "#0ea5e9", // sky
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ec4899", // pink
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#f43f5e", // rose
  "#84cc16", // lime
];

