import fs from "node:fs";
import path from "node:path";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { escapeHtml } from "@/lib/pdf/invoice-labels";

const SHOT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-style: normal; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

function imgDataUrl(fileName: string): string | null {
  const full = path.join(SHOT_DIR, fileName);
  if (!fs.existsSync(full)) return null;
  return `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`;
}

function loadLogo(): string | null {
  // עדיפות לגרסה המוקטעת (ללא המסגרת הכהה)
  const candidates = [
    path.join(process.cwd(), "assets", "logo-bsd-ybm-center.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-official.png"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
    }
  }
  return null;
}

type FeatureCard = { icon: string; title: string; desc: string };
type Showcase = {
  file: string;
  num: string;
  kicker: string;
  title: string;
  desc: string;
  features: string[];
};

const SHOWCASES: Showcase[] = [
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
    features: ["Launcher מותאם אישית (גרירה ושינוי גודל)", "Omnibar — פקודות מהירות עם AI", "חלונות צפים שניתנים למיקסום ושינוי גודל", "אישי הקשר וקיצורי דרך"],
  },
  {
    file: "03-finance-hub.png",
    num: "03",
    kicker: "פיננסים",
    title: "בקרה פיננסית בזמן אמת",
    desc: "סה״כ הכנסות, רווח תפעולי, סטטוס הצעות מחיר וגרף הוצאות חודשי — והכל עם תובנות AI חיות.",
    features: ["KPI ראשיים: הכנסות / רווח / הוצאות", "AI Financial Intelligence — זיהוי חריגות", "סטטוס הצעות מחיר (ממתין/נחתם)", "ייצוא לרואה חשבון (CSV/PDF)"],
  },
  {
    file: "04-projects-hub.png",
    num: "04",
    kicker: "פרויקטים",
    title: "ניהול פרויקטים בלי אקסלים",
    desc: "בחירת פרויקט קלה, סטטוס פעיל/לא פעיל, ומעבר חלק ללוח המשימות או מרכז השליטה של כל אחד.",
    features: ["לוח Kanban למשימות", "מרכז שליטה: תקציב, לוח זמנים, אבני דרך", "מחברת AI לכל פרויקט", "קישור ישיר ל-CRM ולמסמכים"],
  },
  {
    file: "05-crm-table.png",
    num: "05",
    kicker: "CRM",
    title: "לקוחות במרכז — מתויגים, חכמים, מחוברים",
    desc: "טבלת לקוחות מתקדמת עם חיפוש סמנטי, סינון לפי תגיות, וקישור אוטומטי לפרויקטים פעילים.",
    features: ["חיפוש סמנטי (לפי משמעות, לא רק מילה)", "ייבוא מ-Google Contacts / CSV", "תיוג ופילוח דינמיים", "היסטוריית אינטראקציות מלאה"],
  },
  {
    file: "06-documents-hub.png",
    num: "06",
    kicker: "ארכיון ERP",
    title: "כל המסמכים שלך — מאורגנים אוטומטית",
    desc: "ארכיון מרכזי לחשבוניות, הצעות וחוזים — עם זיהוי OCR, תיוג אוטומטי לפי פרויקט, וחיפוש חופשי.",
    features: ["סריקת OCR (Google Document AI)", "חשבוניות, הצעות, חוזים, חתומים", "תיוג אוטומטי לפי פרויקט", "ייצוא בכמות גדולה"],
  },
  {
    file: "07-ai-hub.png",
    num: "07",
    kicker: "בינה מלאכותית",
    title: "AI שעובד על הנתונים שלך",
    desc: "סטודיו מחקר AI מבוסס Gemini 2.5: צרף מסמכים, שאל שאלות, קבל מפת חשיבה, תקציר, או הנפק מסמך חדש.",
    features: ["Gemini 2.5 Flash — תשובות בעברית", "מחברות נושאיות (כמו NotebookLM)", "סקירה קולית של מסמכים", "הנפקת מסמך מתוצאות AI"],
  },
  {
    file: "10-notebook-lm.png",
    num: "08",
    kicker: "מחברת חקירה",
    title: "NotebookLM משלך — בתוך הארגון",
    desc: "מחברות AI שמכירות את הקבצים שלך: PDF, Word, Excel, תמונות, JSON. שאלה בעברית — תשובה עם ציטוטים.",
    features: ["העלאת קבצים: PDF, Office, OpenDocument, תמונות", "מקורות ידע עם ציטוטים", "מפת חשיבה ותקציר אוטומטי", "סקירה קולית חיה (Gemini Live)"],
  },
  {
    file: "11-meckano-reports.png",
    num: "09",
    kicker: "שעות עבודה",
    title: "אינטגרציית Meckano — שעות בלי כפילויות",
    desc: "מושכים את שעות העובדים ישירות מ-Meckano, מסננים לפי פרויקט/תאריך, ומייצאים לרואה חשבון.",
    features: ["סנכרון אוטומטי מ-Meckano", "סינון לפי עובד/פרויקט/טווח תאריכים", "ייצוא PDF ו-CSV", "חיבור ישיר למודול פרויקטים"],
  },
];

// Lucide-style SVG icons rendered inline (stroke-based, accent-colored)
const ICONS = {
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

const TECH_STACK: FeatureCard[] = [
  { icon: ICONS.zap, title: "Next.js 15 + RSC", desc: "App Router, סטרימינג, ביצועים מתקדמים" },
  { icon: ICONS.database, title: "PostgreSQL (Neon)", desc: "Prisma 6, מיגרציות מנוהלות, גיבוי DR" },
  { icon: ICONS.shieldCheck, title: "Auth + Passkeys", desc: "NextAuth + SimpleWebAuthn, חיבור Google" },
  { icon: ICONS.bot, title: "AI רב-מודלי", desc: "Gemini 2.5, Claude, OpenAI, Groq" },
  { icon: ICONS.creditCard, title: "תשלומים", desc: "PayPal + PayPlus (ישראלי) + חשבוניות" },
  { icon: ICONS.activity, title: "ניטור Enterprise", desc: "Sentry, PostHog, Sentry Crons, Lighthouse CI" },
];

const AUDIENCES: FeatureCard[] = [
  { icon: ICONS.hardHat, title: "קבלני בנייה", desc: "פרויקטים, שטח, מסמכים, תקציב — בענן" },
  { icon: ICONS.briefcase, title: "מנהלי פרויקטים", desc: "Kanban, אבני דרך, מחברת AI לכל פרויקט" },
  { icon: ICONS.wallet, title: "צוותי כספים", desc: "הפקת מסמכים, מע״מ, ייצוא לרואה חשבון" },
  { icon: ICONS.users, title: "בעלי עסקים", desc: "דשבורד KPI חי, התראות, AI שמדבר עברית" },
];

function showcaseSection(s: Showcase, accent: string): string {
  const src = imgDataUrl(s.file);
  const features = s.features
    .map(
      (f) =>
        `<li><span class="check">✓</span><span>${escapeHtml(f)}</span></li>`,
    )
    .join("");
  const imgHtml = src
    ? `<img src="${src}" alt="${escapeHtml(s.title)}" />`
    : `<div class="img-empty">${escapeHtml(s.kicker)}</div>`;

  return `
<section class="page showcase" style="--accent:${accent};">
  <div class="showcase-bg"></div>
  <div class="showcase-header">
    <div class="num-pill">${escapeHtml(s.num)}</div>
    <div class="showcase-titles">
      <div class="kicker">${escapeHtml(s.kicker)}</div>
      <h2>${escapeHtml(s.title)}</h2>
    </div>
  </div>
  <p class="lead">${escapeHtml(s.desc)}</p>
  <ul class="checklist">${features}</ul>
  <div class="monitor">
    <div class="monitor-frame">
      <div class="browser-chrome">
        <div class="traffic">
          <span class="dot dot-red"></span>
          <span class="dot dot-yellow"></span>
          <span class="dot dot-green"></span>
        </div>
        <div class="address-bar">
          <span class="lock">🔒</span>
          <a class="url" href="https://bsd-ybm.co.il">bsd-ybm.co.il</a>
        </div>
        <div class="chrome-spacer"></div>
      </div>
      <div class="screen">${imgHtml}</div>
    </div>
    <div class="monitor-stand"></div>
    <div class="monitor-base"></div>
  </div>
</section>`;
}

const ACCENTS = [
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

export function buildProductBrochureV2Html(): string {
  const generated = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const logo = loadLogo();
  const logoImg = logo
    ? `<div class="logo-wrap"><div class="logo-glow"></div><img src="${logo}" alt="BSD-YBM" class="logo" /></div>`
    : `<div class="logo-wrap"><div class="logo-glow"></div><div class="logo logo-fallback">BSD-YBM</div></div>`;

  const showcaseHtml = SHOWCASES.map((s, i) =>
    showcaseSection(s, ACCENTS[i % ACCENTS.length] ?? "#6366f1"),
  ).join("\n");

  const techCards = TECH_STACK.map(
    (c) =>
      `<div class="tech-card"><span class="tech-icon">${c.icon}</span><div class="tech-text"><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.desc)}</span></div></div>`,
  ).join("");

  const audienceCards = AUDIENCES.map(
    (c) =>
      `<div class="aud-card"><span class="aud-icon">${c.icon}</span><strong>${escapeHtml(c.title)}</strong><span>${escapeHtml(c.desc)}</span></div>`,
  ).join("");

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>BSD-YBM OS — דף מוצר ${generated}</title>
<style>
${fontFaceCss()}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: "NotoHebrew", "Heebo", "Segoe UI", Arial, sans-serif;
  color: #0f172a;
  background: #f8fafc;
  direction: rtl;
  font-size: 10.5pt;
  line-height: 1.55;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page { size: A4 portrait; margin: 0; }

.page {
  width: 210mm;
  /* גובה השאר אחרי margin-bottom של 16mm לפוטר Chromium */
  height: 281mm;
  padding: 14mm 14mm 8mm;
  page-break-after: always;
  break-after: page;
  page-break-inside: avoid;
  break-inside: avoid;
  position: relative;
  background: #ffffff;
  overflow: hidden;
  box-sizing: border-box;
}
.page:last-child { page-break-after: auto; break-after: auto; }
.modular-banner, .modular-hero, .promise-card, .creator-bio-card,
.tech-card, .aud-card, .toc-item, .showcase-header, .cta, .summary-card {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* ====== COVER ====== */
.cover {
  background:
    radial-gradient(ellipse at 30% 0%, rgba(99,102,241,0.35), transparent 60%),
    radial-gradient(ellipse at 80% 100%, rgba(16,185,129,0.25), transparent 55%),
    linear-gradient(160deg, #0b1020 0%, #1e1b4b 45%, #312e81 100%);
  color: #fff;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.cover-grid {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(ellipse at center, black 40%, transparent 80%);
}
.cover-content {
  position: relative; z-index: 1;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 18mm 16mm 14mm;
}
.cover .logo-wrap {
  position: relative;
  margin: 4mm 0 8mm;
  display: flex; align-items: center; justify-content: center;
}
.cover .logo-glow {
  position: absolute;
  inset: -40px;
  background:
    radial-gradient(circle at center, rgba(99,102,241,0.55) 0%, rgba(16,185,129,0.25) 35%, transparent 65%);
  filter: blur(20px);
  z-index: 0;
}
.cover .logo {
  position: relative;
  z-index: 1;
  width: 86mm; height: 86mm;
  object-fit: contain;
  background: transparent;
  /* כל המסגרת והרקע מוסרים — התמונה כבר עגולה שקופה */
  filter: drop-shadow(0 18px 36px rgba(99,102,241,0.45)) drop-shadow(0 4px 12px rgba(0,0,0,0.35));
}
.cover .logo-fallback {
  display: flex; align-items: center; justify-content: center;
  color: #312e81; font-weight: 700; font-size: 30pt;
  background: #fff;
}
.cover .eyebrow {
  margin-top: 6mm;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  font-size: 8.5pt; font-weight: 700;
  letter-spacing: 0.06em;
}
.cover .eyebrow .pulse {
  width: 8px; height: 8px; border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 0 0 rgba(16,185,129,0.7);
}
.cover h1 {
  margin-top: 6mm;
  font-size: 36pt;
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
}
.cover h1 .grad {
  background: linear-gradient(90deg, #a5b4fc, #6ee7b7);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.cover .tagline {
  margin-top: 4mm;
  font-size: 12.5pt;
  color: rgba(255,255,255,0.85);
  max-width: 150mm;
}
.cover .hero-box {
  margin-top: 7mm;
  padding: 16px 20px;
  border-radius: 16px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  backdrop-filter: blur(8px);
  max-width: 165mm;
  text-align: center;
}
.cover .hero-box strong { font-size: 11pt; color: #c7d2fe; }
.cover .hero-box p { margin-top: 6px; font-size: 10pt; color: rgba(255,255,255,0.82); }
.cover .stats {
  margin-top: auto;
  display: flex;
  gap: 14px;
  padding-top: 28px;
}
.cover .stat {
  flex: 1;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
}
.cover .stat strong {
  display: block; font-size: 20pt; font-weight: 700;
  color: #fff;
}
.cover .stat span {
  display: block; margin-top: 3px;
  font-size: 8.5pt; color: rgba(255,255,255,0.7);
}
.cover .footer-bar {
  position: relative; z-index: 1;
  margin: 0 16mm 14mm;
  display: flex;
  justify-content: space-between;
  font-size: 8pt;
  color: rgba(255,255,255,0.55);
  border-top: 1px solid rgba(255,255,255,0.12);
  padding-top: 10px;
}

/* ====== TOC / EXEC SUMMARY ====== */
.exec h1 {
  font-size: 24pt; font-weight: 700;
  color: #0f172a;
  margin-bottom: 6px;
  letter-spacing: -0.02em;
}
.exec .sub {
  color: #64748b;
  font-size: 11pt;
  margin-bottom: 22px;
}
.exec .summary-card {
  padding: 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, #eef2ff 0%, #fdf4ff 100%);
  border: 1px solid #e0e7ff;
  margin-bottom: 22px;
  font-size: 11pt;
  line-height: 1.7;
  color: #1e293b;
}
.exec .summary-card .lead-quote {
  font-weight: 700; color: #4338ca; font-size: 12pt;
  margin-bottom: 8px;
}

.toc-title { font-size: 14pt; font-weight: 700; margin: 14px 0 10px; color: #0f172a; }
.toc {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.toc-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  font-size: 9.5pt;
}
.toc-item .num {
  flex: 0 0 28px;
  height: 28px;
  border-radius: 8px;
  background: #4f46e5;
  color: #fff;
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  font-size: 9pt;
}
.toc-item strong { display: block; color: #0f172a; }
.toc-item span { font-size: 8pt; color: #64748b; }

/* ====== SHOWCASE ====== */
.showcase {
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}
.showcase-bg {
  position: absolute; inset: 0;
  background:
    radial-gradient(circle at 100% 0%, color-mix(in srgb, var(--accent) 16%, transparent) 0%, transparent 45%),
    radial-gradient(circle at 0% 100%, color-mix(in srgb, var(--accent) 10%, transparent) 0%, transparent 50%);
  pointer-events: none;
}
.showcase > *:not(.showcase-bg) { position: relative; z-index: 1; }
.showcase-header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 6px;
}
.showcase-header .num-pill {
  width: 52px; height: 52px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, white) 100%);
  color: #fff;
  font-weight: 700;
  font-size: 17pt;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 8px 22px color-mix(in srgb, var(--accent) 35%, transparent);
}
.showcase-titles .kicker {
  font-size: 8.5pt;
  font-weight: 700;
  color: var(--accent);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 2px;
}
.showcase-titles h2 {
  font-size: 20pt;
  font-weight: 700;
  letter-spacing: -0.025em;
  color: #0f172a;
  line-height: 1.1;
}
.showcase .lead {
  margin-top: 8px;
  font-size: 10.5pt;
  color: #475569;
  max-width: 170mm;
  margin-bottom: 12px;
}
.showcase .checklist {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 18px;
  margin-bottom: 14px;
  list-style: none;
}
.showcase .checklist li {
  display: flex; align-items: flex-start; gap: 8px;
  font-size: 9.5pt;
  color: #334155;
}
.showcase .checklist .check {
  flex: 0 0 18px; height: 18px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--accent) 18%, white);
  color: var(--accent);
  font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  font-size: 9pt;
  margin-top: 1px;
}

/* ====== MONITOR (desktop frame) ====== */
.monitor {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 4mm;
}
.monitor-frame {
  width: 100%;
  border-radius: 14px 14px 4px 4px;
  background: linear-gradient(180deg, #1a1f2e 0%, #0a0e18 100%);
  padding: 7px 7px 9px;
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.06),
    inset 0 0 0 1px rgba(255,255,255,0.04),
    0 1px 0 rgba(255,255,255,0.5),
    0 14px 30px rgba(15,23,42,0.18),
    0 40px 80px color-mix(in srgb, var(--accent) 22%, transparent);
  position: relative;
}
.monitor-frame::before {
  content: "";
  position: absolute;
  top: 0; left: 50%;
  transform: translateX(-50%);
  width: 80px; height: 6px;
  background: #0a0e18;
  border-radius: 0 0 8px 8px;
}
.browser-chrome {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: linear-gradient(180deg, #2a3142 0%, #1e2433 100%);
  border-radius: 9px 9px 0 0;
  border-bottom: 1px solid rgba(0,0,0,0.4);
}
.traffic { display: flex; gap: 6px; }
.dot {
  width: 11px; height: 11px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(0,0,0,0.15), inset 0 1px 1px rgba(255,255,255,0.3);
}
.dot-red { background: #ff5f57; }
.dot-yellow { background: #febc2e; }
.dot-green { background: #28c840; }
.address-bar {
  flex: 0 1 auto;
  display: flex; align-items: center; gap: 6px;
  padding: 4px 14px;
  border-radius: 6px;
  background: rgba(0,0,0,0.35);
  border: 1px solid rgba(255,255,255,0.06);
  min-width: 50%;
  justify-content: center;
}
.address-bar .lock { font-size: 9pt; opacity: 0.7; }
.address-bar .url {
  font-size: 8.5pt;
  color: #cbd5e1;
  direction: ltr; unicode-bidi: embed;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  text-decoration: none;
}
.chrome-spacer { flex: 1; }
.screen {
  background: #0b1220;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: hidden;
  border-radius: 0 0 6px 6px;
}
.screen img {
  width: 100%;
  height: auto;
  max-height: 155mm;
  object-fit: contain;
  object-position: top center;
  display: block;
}
.monitor-stand {
  width: 12mm; height: 4mm;
  background: linear-gradient(180deg, #1a1f2e, #2a3142);
  border-radius: 0 0 3px 3px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.2);
}
.monitor-base {
  width: 60mm; height: 2.5mm;
  background: linear-gradient(180deg, #2a3142, #1a1f2e);
  border-radius: 999px;
  box-shadow: 0 4px 12px rgba(15,23,42,0.25);
  margin-top: 1px;
}
.img-empty {
  width: 100%; height: 120mm;
  display: flex; align-items: center; justify-content: center;
  color: #64748b; font-size: 10pt;
  border: 2px dashed #334155; border-radius: 10px;
}

/* ====== TECH STACK PAGE ====== */
.section-h1 {
  font-size: 22pt; font-weight: 700;
  letter-spacing: -0.02em;
  color: #0f172a;
  margin-bottom: 4px;
}
.section-sub { color: #64748b; font-size: 11pt; margin-bottom: 22px; }

.tech-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 22px;
}
.tech-card {
  display: flex;
  gap: 14px;
  padding: 16px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid #e2e8f0;
  align-items: center;
}
.tech-icon {
  flex: 0 0 48px;
  width: 48px; height: 48px;
  border-radius: 12px;
  background: linear-gradient(135deg, #eef2ff, #ede9fe);
  display: flex; align-items: center; justify-content: center;
  color: #4f46e5;
}
.tech-icon svg { width: 24px; height: 24px; display: block; }
.tech-text { flex: 1; min-width: 0; }
.tech-card strong { display: block; font-size: 11pt; color: #0f172a; }
.tech-card span { display: block; font-size: 9pt; color: #64748b; margin-top: 2px; }

.aud-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 18px;
}
.aud-card {
  padding: 18px;
  border-radius: 16px;
  background: linear-gradient(160deg, #4f46e5 0%, #6366f1 100%);
  color: #fff;
}
.aud-card .aud-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px; height: 44px;
  border-radius: 12px;
  background: rgba(255,255,255,0.15);
  color: #fff;
  margin-bottom: 10px;
}
.aud-card .aud-icon svg { width: 24px; height: 24px; display: block; }
.aud-card strong { display: block; font-size: 12pt; }
.aud-card span { display: block; font-size: 9pt; color: rgba(255,255,255,0.85); margin-top: 4px; }

.cta {
  margin-top: 14px;
  padding: 22px 22px;
  border-radius: 18px;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(99,102,241,0.25), transparent 60%),
    linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
  color: #fff;
  text-align: center;
}
.cta h3 { font-size: 16pt; font-weight: 700; letter-spacing: -0.02em; }
.cta p { color: rgba(255,255,255,0.78); margin-top: 6px; font-size: 10pt; }
.cta .btn {
  display: inline-block;
  margin-top: 14px;
  padding: 9px 22px;
  border-radius: 999px;
  background: linear-gradient(90deg, #a5b4fc, #6ee7b7);
  color: #0f172a;
  font-weight: 700;
  font-size: 10pt;
}
.cta .btn { text-decoration: none; }
.cta .blessing {
  margin-top: 14px;
  font-size: 11pt;
  font-weight: 700;
  color: #fbbf24;
}

/* ====== CREATOR PAGE — dedicated full page ====== */
.creator-page {
  background: linear-gradient(180deg, #0b1020 0%, #1e1b4b 60%, #312e81 100%);
  color: #fff;
  padding: 22mm 18mm 14mm;
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.creator-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px);
  background-size: 24px 24px;
  mask-image: radial-gradient(ellipse at center, black 30%, transparent 80%);
  pointer-events: none;
}
.creator-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.55;
  pointer-events: none;
}
.creator-orb-a {
  width: 220px; height: 220px;
  background: #6366f1;
  top: -60px; right: -60px;
}
.creator-orb-b {
  width: 280px; height: 280px;
  background: #10b981;
  bottom: -80px; left: -80px;
  opacity: 0.35;
}
.creator-page > *:not(.creator-bg):not(.creator-orb) { position: relative; z-index: 1; }

.creator-eyebrow {
  align-self: center;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  font-size: 9pt; font-weight: 700;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.85);
}
.creator-eyebrow .dot-live {
  width: 8px; height: 8px; border-radius: 50%;
  background: #10b981;
  box-shadow: 0 0 8px rgba(16,185,129,0.8);
}

.creator-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  margin-top: 8mm;
}
.creator-monogram-wrap {
  position: relative;
  width: 120px; height: 120px;
  display: flex; align-items: center; justify-content: center;
}
.creator-monogram-glow {
  position: absolute; inset: -30px;
  background: radial-gradient(circle at center, rgba(99,102,241,0.6), rgba(16,185,129,0.25) 50%, transparent 75%);
  filter: blur(16px);
}
.creator-monogram {
  position: relative;
  width: 110px; height: 110px;
  border-radius: 32px;
  background:
    linear-gradient(135deg, #6366f1 0%, #818cf8 50%, #a5b4fc 100%);
  color: #fff;
  font-size: 38pt; font-weight: 700;
  letter-spacing: -0.04em;
  display: flex; align-items: center; justify-content: center;
  box-shadow:
    0 24px 50px rgba(99,102,241,0.45),
    inset 0 1px 0 rgba(255,255,255,0.25);
}
.creator-h1 {
  margin-top: 8mm;
  font-size: 32pt;
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.1;
  background: linear-gradient(90deg, #ffffff 0%, #c7d2fe 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.creator-role {
  margin-top: 4mm;
  font-size: 11.5pt;
  color: rgba(255,255,255,0.78);
  letter-spacing: 0.01em;
}

.creator-bio-card {
  margin-top: 7mm;
  padding: 14px 18px;
  border-radius: 16px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  backdrop-filter: blur(8px);
  font-size: 9.5pt;
  line-height: 1.65;
  color: rgba(255,255,255,0.88);
}
.creator-bio-card p { margin-bottom: 8px; }
.creator-bio-card p:last-child { margin-bottom: 0; }
.creator-bio-card strong { color: #c7d2fe; font-weight: 700; }

.creator-skills {
  margin-top: 6mm;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}
.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  font-size: 9pt;
  color: #e0e7ff;
  font-weight: 700;
}
.skill-icon { display: inline-flex; color: #a5b4fc; }
.skill-icon svg { width: 14px; height: 14px; display: block; }

.creator-contact-row {
  margin-top: 8mm;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.contact-big {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 16px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  color: #fff;
  text-decoration: none;
}
.contact-big-icon {
  flex: 0 0 42px;
  width: 42px; height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #6366f1, #818cf8);
  display: flex; align-items: center; justify-content: center;
  color: #fff;
}
.contact-big-icon svg { width: 20px; height: 20px; }
.contact-big-text {
  display: flex; flex-direction: column;
  min-width: 0;
}
.contact-label {
  font-size: 8pt; font-weight: 700;
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.contact-value {
  font-size: 13pt; font-weight: 700;
  color: #fff;
  margin-top: 2px;
}

.creator-footer {
  margin-top: auto;
  padding-top: 8mm;
  text-align: center;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.copyright {
  font-size: 9.5pt;
  color: rgba(255,255,255,0.85);
}
.copyright strong { color: #fbbf24; }
.meta {
  margin-top: 4px;
  font-size: 8pt;
  color: rgba(255,255,255,0.5);
}

a { color: inherit; }

/* ====== MODULAR EMPHASIS BANNERS ====== */
.modular-banner {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 16px;
  padding: 14px 18px;
  border-radius: 16px;
  background: linear-gradient(135deg, #fef3c7 0%, #fed7aa 100%);
  border: 1.5px solid #fbbf24;
  box-shadow: 0 4px 14px rgba(251,191,36,0.18);
}
.modular-banner.cover-variant {
  background:
    linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(16,185,129,0.18) 100%);
  border-color: rgba(251,191,36,0.5);
  margin-top: 18px;
  max-width: 165mm;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.modular-icon {
  flex: 0 0 42px;
  width: 42px; height: 42px;
  border-radius: 12px;
  background: linear-gradient(135deg, #f59e0b, #fbbf24);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 4px 10px rgba(245,158,11,0.35);
}
.modular-icon svg { width: 22px; height: 22px; }
.modular-icon.dark {
  background: linear-gradient(135deg, #4338ca, #6366f1);
  box-shadow: 0 4px 10px rgba(67,56,202,0.35);
}
.modular-text { flex: 1; min-width: 0; }
.modular-text strong {
  display: block;
  font-size: 11pt;
  font-weight: 700;
  color: #78350f;
  line-height: 1.25;
}
.modular-text span {
  display: block;
  margin-top: 4px;
  font-size: 9pt;
  color: #92400e;
  line-height: 1.55;
}
.modular-text u { text-decoration: underline; text-underline-offset: 2px; font-weight: 700; }
.cover-variant .modular-text strong { color: #fff; font-size: 11.5pt; }
.cover-variant .modular-text span { color: rgba(255,255,255,0.85); }
.modular-text.dark strong { color: #1e1b4b; }
.modular-text.dark span { color: #4338ca; }

/* ====== MODULAR HERO (tech page) ====== */
.modular-hero {
  margin-top: 14px;
  padding: 22px 22px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 90% 10%, rgba(99,102,241,0.18), transparent 50%),
    radial-gradient(circle at 10% 100%, rgba(16,185,129,0.15), transparent 50%),
    linear-gradient(135deg, #0f172a 0%, #1e1b4b 100%);
  color: #fff;
  border: 1px solid rgba(255,255,255,0.08);
  text-align: center;
}
.modular-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  border-radius: 999px;
  background: rgba(251,191,36,0.18);
  border: 1px solid rgba(251,191,36,0.4);
  font-size: 8.5pt;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #fbbf24;
  text-transform: uppercase;
}
.badge-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 10px rgba(251,191,36,0.7);
}
.modular-hero-title {
  margin-top: 10px;
  font-size: 17pt;
  font-weight: 700;
  letter-spacing: -0.02em;
  background: linear-gradient(90deg, #ffffff, #c7d2fe);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.modular-hero-lead {
  margin-top: 6px;
  font-size: 10pt;
  color: rgba(255,255,255,0.78);
  max-width: 150mm;
  margin-inline: auto;
}
.modular-pillars {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  text-align: center;
}
.pillar {
  padding: 12px 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
}
.pillar .pillar-icon {
  display: inline-flex;
  width: 38px; height: 38px;
  border-radius: 11px;
  background: linear-gradient(135deg, #4f46e5, #818cf8);
  color: #fff;
  align-items: center; justify-content: center;
  margin-bottom: 6px;
}
.pillar .pillar-icon svg { width: 20px; height: 20px; }
.pillar strong {
  display: block;
  font-size: 10pt;
  font-weight: 700;
  color: #fff;
}
.pillar span {
  display: block;
  margin-top: 4px;
  font-size: 8.5pt;
  color: rgba(255,255,255,0.7);
  line-height: 1.45;
}

/* ====== PROMISE CARD (creator page) ====== */
.promise-card {
  margin-top: 6mm;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 18px;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(16,185,129,0.08) 100%);
  border: 1.5px solid rgba(251,191,36,0.4);
}
.promise-icon {
  flex: 0 0 44px;
  width: 44px; height: 44px;
  border-radius: 12px;
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px rgba(251,191,36,0.4);
}
.promise-icon svg { width: 22px; height: 22px; }
.promise-text { flex: 1; min-width: 0; }
.promise-title {
  font-size: 11pt;
  font-weight: 700;
  color: #fbbf24;
  letter-spacing: 0.02em;
}
.promise-text p {
  margin-top: 6px;
  font-size: 9.5pt;
  color: rgba(255,255,255,0.88);
  line-height: 1.65;
}
.promise-text strong { color: #fde68a; font-weight: 700; }
</style>
</head>
<body>

<section class="page cover">
  <div class="cover-grid"></div>
  <div class="cover-content">
    ${logoImg}
    <span class="eyebrow"><span class="pulse"></span>BSD-YBM OS · גרסה ${generated}</span>
    <h1>מערכת ההפעלה<br/><span class="grad">לעסק שלך</span></h1>
    <p class="tagline">CRM · ERP · פיננסים · AI — שולחן עבודה אחד עם חלונות, סרגל פעולות ועוזר חכם בעברית.</p>
    <div class="hero-box">
      <strong>למי זה מיועד?</strong>
      <p>לקבלני בנייה, מנהלי פרויקטים, צוותי כספים ובעלי עסקים שמחפשים פלטפורמה אחת במקום עשר.</p>
    </div>

    <div class="modular-banner cover-variant">
      <div class="modular-icon">${ICONS.zap}</div>
      <div class="modular-text">
        <strong>100% מודולרי · מותאם אישית לכל לקוח</strong>
        <span>כל מודול ניתן לעריכה, שינוי או הסרה · מערכות שלמות קיימות נשתלות ומשתלבות באתר באופן מושלם</span>
      </div>
    </div>

    <div class="stats">
      <div class="stat"><strong>9</strong><span>מודולים מרכזיים</span></div>
      <div class="stat"><strong>4</strong><span>ספקי AI</span></div>
      <div class="stat"><strong>3</strong><span>שפות (עב/אנ/רוס)</span></div>
      <div class="stat"><strong>∞</strong><span>אפשרויות התאמה</span></div>
    </div>
  </div>
  <div class="footer-bar">
    <span>דף מוצר לשיווק · צילומי מסך אמיתיים</span>
    <span>BSD-YBM OS · ${escapeHtml(generated)}</span>
  </div>
</section>

<section class="page exec">
  <h1>סיכום מנהלים</h1>
  <p class="sub">כל מה שצריך לדעת על BSD-YBM OS — בעמוד אחד.</p>

  <div class="summary-card">
    <div class="lead-quote">"כל הכלים שעסק קטן-בינוני צריך — מאוחדים מאחורי כניסה אחת, בעברית, עם AI שמבין את ההקשר הארגוני שלך."</div>
    BSD-YBM OS היא פלטפורמת SaaS רב-דיירית לניהול עסקים, עם דגש על ענף הבנייה.
    היא משלבת CRM, ERP, ניהול פרויקטים, מערך פיננסי, סריקת מסמכים והפקתם, ועוזרי AI מרובים —
    בתוך ממשק יחיד בסגנון מערכת הפעלה (חלונות צפים, Hub-ים, Omnibar).
  </div>

  <div class="modular-banner">
    <div class="modular-icon dark">${ICONS.zap}</div>
    <div class="modular-text dark">
      <strong>בנוי מודולרית — מתאים את עצמו אליך, לא להפך</strong>
      <span>
        כל מודול ניתן <u>לעריכה</u>, <u>שינוי</u> או <u>עדכון</u> לפי בקשת הלקוח.
        ניתן להוסיף <u>מערכות שלמות קיימות</u> ולמזג אותן באתר באופן מושלם —
        ללא פשרות בעיצוב, ביצועים או אבטחה.
      </span>
    </div>
  </div>

  <div class="toc-title">תוכן עניינים</div>
  <div class="toc">
    ${SHOWCASES.map(
      (s) => `<div class="toc-item">
      <div class="num">${escapeHtml(s.num)}</div>
      <div><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.kicker)}</span></div>
    </div>`,
    ).join("")}
  </div>
</section>

${showcaseHtml}

<section class="page">
  <h1 class="section-h1">תשתית, אבטחה ואמינות</h1>
  <p class="section-sub">בנוי על מחסנית טכנולוגית מודרנית — עם ניטור, גיבוי ו-Compliance.</p>
  <div class="tech-grid">${techCards}</div>

  <div class="modular-hero">
    <div class="modular-hero-badge">
      <span class="badge-dot"></span>
      ארכיטקטורה מודולרית
    </div>
    <h2 class="modular-hero-title">המערכת עובדת בשבילך — לא להפך</h2>
    <p class="modular-hero-lead">
      כל פיצ׳ר נבנה כמודול עצמאי. אפשר להפעיל, לכבות, לערוך, לעדכן או להחליף — ללא נגיעה בשאר המערכת.
    </p>
    <div class="modular-pillars">
      <div class="pillar">
        <span class="pillar-icon">${ICONS.zap}</span>
        <strong>עריכה ועדכון</strong>
        <span>כל מודול, שדה ותהליך — נערך לפי בקשת הלקוח, ללא מגבלות.</span>
      </div>
      <div class="pillar">
        <span class="pillar-icon">${ICONS.database}</span>
        <strong>הוספת מערכות</strong>
        <span>שילוב מערכות שלמות קיימות (CRM/ERP/מלאי) ומיזוגן בצורה מושלמת.</span>
      </div>
      <div class="pillar">
        <span class="pillar-icon">${ICONS.bot}</span>
        <strong>מודולים חדשים</strong>
        <span>בניית פיצ׳רים מותאמים אישית — בדיוק כפי שאתה צריך, בתוך הממשק שלך.</span>
      </div>
    </div>
  </div>
</section>

<section class="page">
  <h1 class="section-h1">למי זה מתאים</h1>
  <p class="section-sub">המערכת תוכננה סביב 4 פרסונות מרכזיות — וניתנת להתאמה לכל ענף ושוק.</p>
  <div class="aud-grid">${audienceCards}</div>

  <div class="cta">
    <h3>מוכנים לראות את זה חי?</h3>
    <p>הדגמה אישית · הקמת חשבון ארגוני · התאמה מלאה ומיזוג מערכות קיימות.</p>
    <a class="btn" href="https://bsd-ybm.co.il">bsd-ybm.co.il · התחברות / הרשמה</a>
    <div class="blessing">בעזרת ה' נעשה ונצליח 🙏</div>
  </div>
</section>

<section class="page creator-page">
  <div class="creator-bg"></div>
  <div class="creator-orb creator-orb-a"></div>
  <div class="creator-orb creator-orb-b"></div>

  <div class="creator-eyebrow">
    <span class="dot-live"></span>
    היוצר והמפתח
  </div>

  <div class="creator-hero">
    <div class="creator-monogram-wrap">
      <div class="creator-monogram-glow"></div>
      <div class="creator-monogram">יב</div>
    </div>
    <h1 class="creator-h1">יוחנן בוקשפן</h1>
    <p class="creator-role">יזם ומפתח Full-Stack · בונה את BSD-YBM OS</p>
  </div>

  <div class="creator-bio-card">
    <p>
      יזם ומפתח עצמאי, מתמחה בבניית פלטפורמות <strong>SaaS</strong> מודרניות לשוק הישראלי —
      מהארכיטקטורה ועד החוויה של המשתמש הסופי.
    </p>
    <p>
      <strong>BSD-YBM OS</strong> נבנתה מאפס: מערכת רב-דיירית עם CRM, ERP, ניהול פרויקטים,
      מערך פיננסי, סריקת מסמכים והפקה אוטומטית — כשבמרכז כולם עוזרי AI מרובים
      (<strong>Gemini, Claude, OpenAI</strong>) שמדברים עברית ומכירים את ההקשר הארגוני.
    </p>
    <p>
      התמחות מובהקת בענף <strong>הבנייה</strong>, בתהליכי <strong>הפקת מסמכים</strong>,
      ובחיבור בין כלים ארגוניים. הסטאק הטכנולוגי: Next.js · TypeScript · PostgreSQL ·
      Prisma · Gemini Live · PayPlus · Sentry.
    </p>
  </div>

  <div class="creator-skills">
    <span class="skill-chip"><span class="skill-icon">${ICONS.zap}</span>Next.js 15 / RSC</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.database}</span>PostgreSQL / Prisma</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.bot}</span>AI Integrations</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.shieldCheck}</span>Auth & Passkeys</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.creditCard}</span>Israeli Payments</span>
    <span class="skill-chip"><span class="skill-icon">${ICONS.activity}</span>Observability</span>
  </div>

  <div class="promise-card">
    <div class="promise-icon">${ICONS.shieldCheck}</div>
    <div class="promise-text">
      <div class="promise-title">ההבטחה שלי אליך</div>
      <p>
        המערכת היא <strong>100% מודולרית</strong> וניתנת לעריכה, שינוי ועדכון לפי בקשתך.
        אני <strong>משלב מערכות שלמות קיימות</strong> שלך בתוך הממשק באופן מושלם —
        ומוסיף מודולים חדשים מותאמים אישית לדרישות הספציפיות של העסק.
      </p>
    </div>
  </div>

  <div class="creator-contact-row">
    <a class="contact-big" href="tel:+972525640021">
      <span class="contact-big-icon">${ICONS.phone}</span>
      <span class="contact-big-text">
        <span class="contact-label">חייגו</span>
        <span class="contact-value" dir="ltr">052-564-0021</span>
      </span>
    </a>
    <a class="contact-big" href="https://bsd-ybm.co.il">
      <span class="contact-big-icon">${ICONS.globe}</span>
      <span class="contact-big-text">
        <span class="contact-label">היכנסו לאתר</span>
        <span class="contact-value" dir="ltr">bsd-ybm.co.il</span>
      </span>
    </a>
  </div>

  <div class="creator-footer">
    <div class="copyright">
      © ${new Date().getFullYear()} יוחנן בוקשפן · BSD-YBM OS · <strong>כל הזכויות שמורות</strong>
    </div>
    <div class="meta">דף מוצר ${escapeHtml(generated)} · כל צילומי המסך אמיתיים מהמערכת</div>
  </div>
</section>

</body>
</html>`;
}
