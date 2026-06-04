/**
 * Blog content registry — server-side only.
 *
 * Posts are defined as TypeScript objects (no MDX required).
 * To add a post: add an entry to BLOG_POSTS below.
 * To support MDX in the future: replace body with a lazy import.
 *
 * Phase B — Growth / Content Marketing Engine
 */

export type BlogPost = {
  slug: string;
  titleHe: string;
  titleEn?: string;
  summaryHe: string;
  bodyHe: string;
  publishedAt: string; // ISO date string
  author?: string;
  tags?: string[];
  featured?: boolean;
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "gantt-for-contractors",
    titleHe: "גנט לקבלנים — ניהול לוח זמנים בשטח",
    titleEn: "Gantt for Contractors",
    summaryHe: "איך להשתמש בגנט של BSD-YBM כדי לנהל פרויקטי בנייה, לעקוב אחרי עיכובים, ולשלוח עדכונים ללקוח בלחיצת כפתור.",
    bodyHe: `
ניהול לוח זמנים בפרויקט בנייה הוא אחד האתגרים הגדולים ביותר של הקבלן המודרני.
עם BSD-YBM תוכל ליצור גנט מלא בדקות, לייבא מ-MS Project, ולעדכן התקדמות ישירות מהשטח.

**מה תוכל לעשות:**
- ייבוא לוח זמנים מ-XML/CSV של MS Project
- גרירה ישירה לעדכון אחוז התקדמות
- היררכיה מלאה של משימות ותת-משימות
- התראות אוטומטיות על עיכובים

**פענוח גרמושקה:**
העלה את מסמך הביצוע — הAI שלנו יחלץ את כל המשימות, אבני הדרך, וכתב הכמויות תוך שניות.
    `.trim(),
    publishedAt: "2026-06-01",
    tags: ["גנט", "ניהול פרויקטים", "קבלנים"],
    featured: true,
  },
  {
    slug: "field-copilot-guide",
    titleHe: "מדריך Field Copilot — הכלי של קבלן השטח",
    summaryHe: "יומן עבודה קולי, תיעוד תמונות, וניתוח AI — כל מה שצריך ביום העבודה.",
    bodyHe: `
Field Copilot הוא הכלי שנבנה במיוחד לקבלן שנמצא בשטח ולא מאחורי מחשב.

**הקלט יומן בקול:**
לחץ על המיקרופון, דבר — המערכת תרשום את היומן, תזהה את הפרויקט, ותפיק מסמך אוטומטי.

**תיעוד תמונות:**
צלם את הביצוע — ה-AI יסרוק ויקשר לסעיפים בכתב הכמויות.
    `.trim(),
    publishedAt: "2026-05-20",
    tags: ["field copilot", "קול", "AI"],
    featured: false,
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export function getFeaturedPosts(): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.featured).slice(0, 6);
}

export function getAllPosts(): BlogPost[] {
  return [...BLOG_POSTS].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getPostsByTag(tag: string): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.tags?.includes(tag));
}
