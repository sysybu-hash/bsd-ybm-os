import fs from "node:fs";
import path from "node:path";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { escapeHtml } from "@/lib/pdf/invoice-labels";
import {
  loadProductScreenshotDataUrl,
  PRODUCT_BROCHURE_SCREENSHOTS,
  type ProductBrochureScreenshot,
} from "@/lib/pdf/product-brochure-screenshots";

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype");
}
@font-face {
  font-family: "NotoHebrew";
  font-style: normal;
  font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype");
}`;
}

function loadLogoDataUrl(): string | null {
  const candidates = [
    path.join(process.cwd(), "assets", "logo-bsd-ybm-official.png"),
    path.join(process.cwd(), "public", "logos", "logo-night.png"),
  ];
  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      const buf = fs.readFileSync(filePath);
      return `data:image/png;base64,${buf.toString("base64")}`;
    }
  }
  return null;
}

function bullets(items: string[]): string {
  return `<ul class="bullets">${items.map((t) => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`;
}

function moduleTable(rows: [string, string][]): string {
  const body = rows
    .map(
      ([name, desc]) =>
        `<tr><th scope="row">${escapeHtml(name)}</th><td>${escapeHtml(desc)}</td></tr>`,
    )
    .join("");
  return `<table class="modules"><thead><tr><th>מודול</th><th>יכולות עיקריות</th></tr></thead><tbody>${body}</tbody></table>`;
}

function sectionBand(title: string, subtitle: string): string {
  return `<div class="band"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(subtitle)}</p></div>`;
}

function deviceFrame(imgSrc: string | null, alt: string): string {
  if (!imgSrc) {
    return `<div class="device device-empty"><p>${escapeHtml(alt)}</p></div>`;
  }
  return `<div class="device">
  <div class="device-chrome">
    <span class="dot dot-red"></span>
    <span class="dot dot-yellow"></span>
    <span class="dot dot-green"></span>
    <span class="device-url">app.bsd-ybm.com</span>
  </div>
  <div class="device-screen">
    <img src="${imgSrc}" alt="${escapeHtml(alt)}" />
  </div>
</div>`;
}

function showcasePage(shot: ProductBrochureScreenshot, index: number): string {
  const src = loadProductScreenshotDataUrl(shot.file);
  const highlights =
    shot.highlights && shot.highlights.length > 0
      ? `<div class="showcase-tags">${shot.highlights.map((h) => `<span>${escapeHtml(h)}</span>`).join("")}</div>`
      : "";

  return `<section class="page page-showcase">
  <div class="showcase-top">
    <span class="showcase-num">${String(index).padStart(2, "0")}</span>
    <div class="showcase-titles">
      <span class="showcase-kicker">${escapeHtml(shot.captionHe)}</span>
      <h2>${escapeHtml(shot.titleHe)}</h2>
      <p>${escapeHtml(shot.subtitleHe)}</p>
    </div>
  </div>
  ${highlights}
  ${deviceFrame(src, shot.captionHe)}
</section>`;
}

export function buildProductBrochureHtml(): string {
  const generated = new Date().toLocaleDateString("he-IL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const logo = loadLogoDataUrl();
  const logoImg = logo
    ? `<img src="${logo}" alt="BSD-YBM" class="logo" width="128" height="128" />`
    : `<div class="logo-fallback">BSD-YBM</div>`;

  const showcasePages = PRODUCT_BROCHURE_SCREENSHOTS.map((s, i) => showcasePage(s, i + 1)).join(
    "\n",
  );

  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>BSD-YBM OS — דף מוצר</title>
<style>
${fontFaceCss()}
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "NotoHebrew", "Heebo", "Segoe UI", Arial, sans-serif;
  color: #0f172a;
  background: #f1f5f9;
  direction: rtl;
  font-size: 10.5pt;
  line-height: 1.5;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
@page { size: A4 portrait; margin: 10mm 12mm; }
.page {
  page-break-after: always;
  background: #fff;
  border-radius: 14px;
  padding: 14px 16px 18px;
  box-shadow: 0 1px 0 rgba(15,23,42,0.06);
  min-height: 275mm;
}
.page:last-child { page-break-after: auto; }

/* עטיפה */
.page-cover {
  min-height: 275mm;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(255,255,255,0.12) 0%, transparent 70%),
    linear-gradient(155deg, #1e1b4b 0%, #4338ca 42%, #6366f1 72%, #818cf8 100%);
  color: #fff;
  border-radius: 14px;
  padding: 40px 28px;
  position: relative;
  overflow: hidden;
}
.page-cover::before {
  content: "";
  position: absolute;
  inset: 0;
  background-image: radial-gradient(circle at 20% 80%, rgba(16,185,129,0.15) 0%, transparent 40%),
    radial-gradient(circle at 80% 20%, rgba(59,130,246,0.2) 0%, transparent 35%);
  pointer-events: none;
}
.page-cover > * { position: relative; z-index: 1; }
.page-cover .logo {
  border-radius: 28px;
  background: #fff;
  padding: 14px;
  box-shadow: 0 20px 50px rgba(0,0,0,0.25);
}
.page-cover .logo-fallback { font-size: 32px; font-weight: 700; }
.page-cover .badge {
  display: inline-block;
  margin-top: 22px;
  padding: 7px 16px;
  border-radius: 999px;
  background: rgba(255,255,255,0.14);
  border: 1px solid rgba(255,255,255,0.25);
  font-size: 9.5pt;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.page-cover h1 {
  margin: 22px 0 6px;
  font-size: 34pt;
  font-weight: 700;
  letter-spacing: -0.03em;
  text-shadow: 0 2px 20px rgba(0,0,0,0.15);
}
.page-cover .tagline { font-size: 13pt; opacity: 0.92; }
.page-cover .hero { font-size: 18pt; font-weight: 700; margin-top: 26px; max-width: 400px; }
.page-cover .lead {
  font-size: 10.5pt;
  opacity: 0.88;
  max-width: 440px;
  margin: 14px auto 0;
  line-height: 1.65;
}
.page-cover .date { margin-top: 28px; font-size: 9pt; opacity: 0.7; }

.band {
  background: linear-gradient(95deg, #4338ca, #6366f1);
  color: #fff;
  border-radius: 12px;
  padding: 12px 16px;
  margin: 0 0 12px;
}
.band h2 { margin: 0; font-size: 14pt; font-weight: 700; }
.band p { margin: 3px 0 0; font-size: 9.5pt; opacity: 0.92; }

h3.section { margin: 12px 0 6px; font-size: 11.5pt; color: #312e81; font-weight: 700; }
p.body { margin: 0 0 10px; color: #475569; font-size: 10pt; }
.bullets { margin: 0 0 10px; padding: 0 20px 0 0; font-size: 9.5pt; }
.bullets li { margin-bottom: 4px; color: #334155; }

.modules {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 12px;
  font-size: 9.5pt;
}
.modules th, .modules td {
  border: 1px solid #e2e8f0;
  padding: 7px 9px;
  text-align: right;
  vertical-align: top;
}
.modules thead th { background: #4f46e5; color: #fff; font-weight: 700; }
.modules tbody th[scope="row"] {
  background: #eef2ff;
  color: #312e81;
  font-weight: 700;
  width: 26%;
}

.cta {
  margin-top: 16px;
  text-align: center;
  padding: 16px;
  border-radius: 12px;
  background: linear-gradient(180deg, #eef2ff, #fff);
  border: 1px solid #c7d2fe;
}
.cta strong { display: block; font-size: 12pt; color: #4338ca; margin-bottom: 4px; }
.cta span { color: #64748b; font-size: 9.5pt; }
.cta .blessing { margin-top: 8px; font-weight: 700; color: #312e81; }
.footer-note { margin-top: 16px; text-align: center; font-size: 8.5pt; color: #94a3b8; }

/* עמודי צילום מסך */
.page-showcase {
  display: flex;
  flex-direction: column;
  padding-bottom: 12px;
}
.showcase-top {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  margin-bottom: 10px;
}
.showcase-num {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: linear-gradient(135deg, #4f46e5, #818cf8);
  color: #fff;
  font-size: 14pt;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}
.showcase-kicker {
  display: block;
  font-size: 8.5pt;
  font-weight: 700;
  color: #6366f1;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 2px;
}
.showcase-titles h2 {
  margin: 0;
  font-size: 16pt;
  color: #0f172a;
  font-weight: 700;
  line-height: 1.2;
}
.showcase-titles p {
  margin: 4px 0 0;
  font-size: 9.5pt;
  color: #64748b;
  line-height: 1.45;
}
.showcase-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}
.showcase-tags span {
  font-size: 8pt;
  font-weight: 700;
  color: #4338ca;
  background: #eef2ff;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  padding: 4px 10px;
}

.device {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid #cbd5e1;
  box-shadow:
    0 4px 6px rgba(15,23,42,0.04),
    0 20px 40px rgba(79,70,229,0.12);
  margin-top: auto;
}
.device-chrome {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  background: linear-gradient(180deg, #1e293b, #0f172a);
}
.device-chrome .dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.dot-red { background: #f87171; }
.dot-yellow { background: #fbbf24; }
.dot-green { background: #4ade80; }
.device-url {
  margin-inline-start: auto;
  font-size: 8pt;
  color: #94a3b8;
  direction: ltr;
  unicode-bidi: embed;
}
.device-screen {
  background: #0f172a;
  padding: 10px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  min-height: 0;
}
.device-screen img {
  width: 100%;
  height: auto;
  max-height: 195mm;
  object-fit: contain;
  object-position: top center;
  display: block;
  border-radius: 8px;
  background: #0b1220;
}
.device-empty {
  min-height: 120px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  border: 2px dashed #cbd5e1;
  border-radius: 12px;
}
</style>
</head>
<body>

<section class="page page-cover">
  ${logoImg}
  <span class="badge">BSD-YBM OS · CRM · ERP · AI</span>
  <h1>מערכת ההפעלה לעסק שלך</h1>
  <p class="tagline">מרכז בקרה אחד — לקוחות, פרויקטים, מסמכים, כספים ו-AI</p>
  <p class="hero">תוכנה שמרגישה כמו שולחן עבודה מודרני, לא כמו עוד מערכת מפוזרת</p>
  <p class="lead">דף מוצר לשיווק · צילומי מסך אמיתיים מהמערכת · עודכן ${escapeHtml(generated)}</p>
</section>

<section class="page">
  ${sectionBand("סיכום מנהלים", "למה BSD-YBM OS")}
  <p class="body">BSD-YBM OS היא פלטפורמת SaaS מרובת-דיירים לניהול עסקים — במיוחד בענף הבנייה, קבלנים וניהול חברות. CRM, ERP, סריקת מסמכים, הפקת חשבוניות, דוחות פיננסיים ועוזר AI בממשק אחד.</p>
  ${bullets([
    "שולחן עבודה עם חלונות צפים, סרגל יישומים ו-Omnibar.",
    "שישה Hub מרכזיים + יישומים נפרדים (Drive, Meckano, הגדרות).",
    "אינטגרציות: Google, Meckano, PayPal, PayPlus, Gemini Live.",
    "עברית, אנגלית ורוסית — RTL מובנה.",
    "אבטחה ארגונית: הרשאות, Rate limiting, Sentry.",
  ])}
  ${sectionBand("מפת מודולים", "סקירה לפני הצילומים")}
  ${moduleTable([
    ["פיננסים", "דאשבורד KPI · תזרים · ייצוא לרואה חשבון"],
    ["פרויקטים", "Kanban · מרכז שליטה · מחברת AI"],
    ["CRM", "אנשי קשר · חיפוש סמנטי · ייבוא"],
    ["מסמכים", "ארכיון ERP · הפקה · סורק AI"],
    ["קופיילוט שטח", "הצעות מהשטח לענף בנייה"],
    ["בינה מלאכותית", "צ'אט · Gemini Live · NotebookLM"],
  ])}
  <p class="body" style="margin-top:8px;color:#6366f1;font-weight:700;">בעמודים הבאים — תצוגה חיה מהממשק, ללא חיתוך.</p>
</section>

${showcasePages}

<section class="page">
  ${sectionBand("אינטגרציות ואמינות", "Enterprise-ready")}
  ${bullets([
    "Google OAuth, Drive, Calendar · Meckano · PayPal / PayPlus.",
    "חתימה דיגיטלית · הזמנות משתמשים · PostHog · Sentry.",
    "PostgreSQL (Neon) + Prisma · JWT · CSP · גיבוי DR.",
    "בדיקות: Jest, Playwright, axe.",
  ])}
  ${sectionBand("למי זה מתאים", "קהלי יעד")}
  ${moduleTable([
    ["קבלני בנייה", "פרויקטים, שטח, מסמכים, תקציב, CRM"],
    ["כספים", "הפקת מסמכים, מע''מ, ייצוא לרואה חשבון"],
    ["מנהלי פרויקטים", "לוח משימות, מרכז שליטה, AI"],
    ["בעלי עסקים", "דשבורד והתראות במבט אחד"],
  ])}
  <div class="cta">
    <strong>מוכנים להתחיל?</strong>
    <span>התחברות · הדגמה · פתיחת חשבון ארגוני</span>
    <div class="blessing">בעזרת ה' נעשה ונצליח — BSD-YBM</div>
  </div>
  <p class="footer-note">BSD-YBM OS · דף מוצר לשיווק</p>
</section>

</body>
</html>`;
}
