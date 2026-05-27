import fs from "node:fs";
import path from "node:path";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";

const SHOT_DIR = path.join(process.cwd(), "assets", "product-brochure-v2");
const BRAND_DIR = path.join(process.cwd(), "assets", "brand");
const LOGO_DIR = path.join(process.cwd(), "assets");
const OFFICIAL_LOGO_DIR = path.join(process.cwd(), "public", "logos");

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

function imgDataUrl(dir: string, file: string): string | null {
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return null;
  const ext = path.extname(file).slice(1) || "png";
  const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
  return `data:${mime};base64,${fs.readFileSync(full).toString("base64")}`;
}

// משתמשים בלוגו הרשמי החדש (BY bsd-ybm) מ-public/logos
const LOGO = imgDataUrl(OFFICIAL_LOGO_DIR, "logo-night.png")
  ?? imgDataUrl(LOGO_DIR, "logo-bsd-ybm-center.png");
const SHOT_HOME = imgDataUrl(SHOT_DIR, "02-workspace-home.png");
const SHOT_FINANCE = imgDataUrl(SHOT_DIR, "03-finance-hub.png");
const SHOT_CRM = imgDataUrl(SHOT_DIR, "05-crm-table.png");
const SHOT_AI = imgDataUrl(SHOT_DIR, "07-ai-hub.png");

// ICONS — small inline lucide-style
const I = {
  zap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>`,
  bot: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 13v2"/><path d="M9 13v2"/></svg>`,
  layers: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>`,
  files: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><circle cx="12" cy="15" r="1.5" fill="currentColor"/></svg>`,
  hardHat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.37 1.9.72 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.35 1.85.59 2.81.72A2 2 0 0 1 22 16.92z"/></svg>`,
  globe: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" x2="22" y1="12" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

const FEATURES = [
  { icon: I.users, title: "CRM חכם", desc: "ייצוא/ייבוא CSV, timeline, חיפוש סמנטי" },
  { icon: I.briefcase, title: "פרויקטים", desc: "Kanban + מחברת AI ייעודית לכל פרויקט" },
  { icon: I.hardHat, title: "Field Copilot", desc: "עוזר AI לשטח — ניתוח, אססטים, handoff" },
  { icon: I.calendar, title: "יומן Google", desc: "סנכרון Calendar דו-כיווני, אירועים, cron" },
  { icon: I.wallet, title: "פיננסים + מסמכים", desc: "KPI חי, סורק OCR, ייצוא לרואה חשבון" },
  { icon: I.mic, title: "Gemini Live + AI", desc: "קול חי בעברית · Claude · OpenAI · NotebookLM" },
];

const SHARED_CSS = (variant: "portrait" | "mobile") => `
${fontFaceCss()}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  font-family: "NotoHebrew", "Heebo", "Segoe UI", Arial, sans-serif;
  direction: rtl;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  background: #0b1020;
}
@page { margin: 0; size: ${variant === "portrait" ? "210mm 297mm" : "108mm 192mm"}; }

.page {
  width: ${variant === "portrait" ? "210mm" : "108mm"};
  height: ${variant === "portrait" ? "297mm" : "192mm"};
  background:
    radial-gradient(ellipse 90% 60% at 20% 0%, rgba(99,102,241,0.32), transparent 65%),
    radial-gradient(ellipse 70% 50% at 100% 100%, rgba(14,165,233,0.25), transparent 60%),
    radial-gradient(ellipse 60% 50% at 0% 100%, rgba(16,185,129,0.18), transparent 60%),
    linear-gradient(160deg, #0b1020 0%, #1e1b4b 55%, #312e81 100%);
  color: #fff;
  padding: ${variant === "portrait" ? "8mm 14mm 12mm" : "4mm 7mm 6mm"};
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: ${variant === "portrait" ? "7mm" : "3.5mm"};
}
.grid-bg {
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px);
  background-size: ${variant === "portrait" ? "28px 28px" : "18px 18px"};
  mask-image: radial-gradient(ellipse at center, black 35%, transparent 80%);
  pointer-events: none;
}
.page > * { position: relative; z-index: 1; }

/* BSD top — בסיעתא דשמיא */
.bsd-top {
  text-align: center;
  font-size: ${variant === "portrait" ? "10pt" : "6.2pt"};
  font-weight: 700;
  letter-spacing: ${variant === "portrait" ? "0.18em" : "0.14em"};
  color: #fde68a;
  text-shadow: 0 0 14px rgba(251,191,36,0.5);
  margin-bottom: ${variant === "portrait" ? "-3mm" : "-1.5mm"};
}

/* HEADER */
.head { display: flex; align-items: center; gap: ${variant === "portrait" ? "12px" : "8px"}; }
.head .logo {
  width: ${variant === "portrait" ? "22mm" : "13mm"};
  height: ${variant === "portrait" ? "22mm" : "13mm"};
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(99,102,241,0.5));
}
.head .brand-name {
  font-size: ${variant === "portrait" ? "22pt" : "14pt"};
  font-weight: 700;
  letter-spacing: -0.025em;
  background: linear-gradient(90deg, #ffffff, #c7d2fe);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  line-height: 1;
}
.head .brand-tag {
  font-size: ${variant === "portrait" ? "8.5pt" : "6pt"};
  color: rgba(255,255,255,0.6);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  margin-top: 3px;
}
.head .badge {
  margin-inline-start: auto;
  display: inline-flex; align-items: center; gap: 6px;
  padding: ${variant === "portrait" ? "6px 14px" : "4px 8px"};
  border-radius: 999px;
  background: rgba(251,191,36,0.18);
  border: 1px solid rgba(251,191,36,0.5);
  font-size: ${variant === "portrait" ? "8.5pt" : "6pt"};
  font-weight: 700;
  color: #fde68a;
  letter-spacing: 0.08em;
}
.head .badge .dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #fbbf24;
  box-shadow: 0 0 8px rgba(251,191,36,0.8);
}

/* HERO HEADLINE */
.hero {
  margin-top: ${variant === "portrait" ? "2mm" : "1mm"};
  text-align: center;
}
.hero .eyebrow {
  display: inline-block;
  padding: ${variant === "portrait" ? "5px 12px" : "3px 8px"};
  border-radius: 999px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.18);
  font-size: ${variant === "portrait" ? "9pt" : "6pt"};
  font-weight: 700;
  color: #c7d2fe;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.hero h1 {
  margin-top: ${variant === "portrait" ? "4mm" : "2mm"};
  font-size: ${variant === "portrait" ? "40pt" : "20pt"};
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.05;
  white-space: nowrap;
}
.hero h1 .grad {
  background: linear-gradient(90deg, #a5b4fc 0%, #6ee7b7 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero .hero-tagline {
  margin-top: ${variant === "portrait" ? "5mm" : "3mm"};
  font-size: ${variant === "portrait" ? "18pt" : "11pt"};
  font-weight: 700;
  font-style: italic;
  color: #fde68a;
  letter-spacing: -0.005em;
  text-shadow: 0 0 22px rgba(251,191,36,0.35);
}
.hero .sub {
  margin: ${variant === "portrait" ? "4mm auto 0" : "2.5mm auto 0"};
  font-size: ${variant === "portrait" ? "12pt" : "7.5pt"};
  color: rgba(255,255,255,0.78);
  line-height: 1.45;
  max-width: ${variant === "portrait" ? "170mm" : "100mm"};
  text-align: center;
}

/* SHOWCASE STRIP */
.strip {
  display: grid;
  grid-template-columns: repeat(${variant === "portrait" ? "3" : "2"}, 1fr);
  gap: ${variant === "portrait" ? "8px" : "4px"};
}
.thumb {
  border-radius: ${variant === "portrait" ? "12px" : "7px"};
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.04);
  box-shadow: 0 14px 30px rgba(99,102,241,0.2);
  aspect-ratio: 16 / 10;
  display: flex; align-items: flex-start; justify-content: center;
}
.thumb img {
  width: 100%; height: 100%; object-fit: cover; object-position: top center;
  display: block;
}

/* FEATURES */
.feats {
  display: grid;
  grid-template-columns: ${variant === "portrait" ? "1fr 1fr 1fr" : "1fr 1fr"};
  gap: ${variant === "portrait" ? "10px" : "5px"};
}
.feat {
  padding: ${variant === "portrait" ? "12px 14px" : "7px 9px"};
  border-radius: ${variant === "portrait" ? "14px" : "9px"};
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  display: flex; align-items: center; gap: ${variant === "portrait" ? "10px" : "6px"};
}
.feat .feat-icon {
  flex: 0 0 ${variant === "portrait" ? "36px" : "22px"};
  width: ${variant === "portrait" ? "36px" : "22px"};
  height: ${variant === "portrait" ? "36px" : "22px"};
  border-radius: ${variant === "portrait" ? "10px" : "7px"};
  background: linear-gradient(135deg, #4f46e5, #818cf8);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.feat .feat-icon svg { width: ${variant === "portrait" ? "20px" : "13px"}; height: ${variant === "portrait" ? "20px" : "13px"}; }
.feat .feat-text { min-width: 0; }
.feat strong {
  display: block;
  font-size: ${variant === "portrait" ? "11pt" : "7pt"};
  font-weight: 700; color: #fff;
  line-height: 1.1;
}
.feat span {
  display: block;
  margin-top: 2px;
  font-size: ${variant === "portrait" ? "9pt" : "5.5pt"};
  color: rgba(255,255,255,0.7);
  line-height: 1.35;
}

/* MODULAR BANNER */
.modular {
  display: flex; align-items: center; gap: ${variant === "portrait" ? "14px" : "8px"};
  padding: ${variant === "portrait" ? "14px 18px" : "8px 10px"};
  border-radius: ${variant === "portrait" ? "16px" : "10px"};
  background:
    linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(16,185,129,0.12) 100%);
  border: 1.5px solid rgba(251,191,36,0.45);
  margin-top: ${variant === "portrait" ? "2mm" : "1mm"};
}
.modular-icon {
  flex: 0 0 ${variant === "portrait" ? "42px" : "24px"};
  width: ${variant === "portrait" ? "42px" : "24px"};
  height: ${variant === "portrait" ? "42px" : "24px"};
  border-radius: ${variant === "portrait" ? "12px" : "7px"};
  background: linear-gradient(135deg, #fbbf24, #f59e0b);
  color: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 6px 14px rgba(251,191,36,0.4);
}
.modular-icon svg { width: ${variant === "portrait" ? "22px" : "14px"}; height: ${variant === "portrait" ? "22px" : "14px"}; }
.modular-text strong {
  display: block;
  font-size: ${variant === "portrait" ? "11.5pt" : "7.5pt"};
  font-weight: 700;
  color: #fde68a;
  line-height: 1.2;
}
.modular-text span {
  display: block;
  margin-top: 3px;
  font-size: ${variant === "portrait" ? "9.5pt" : "5.8pt"};
  color: rgba(255,255,255,0.82);
  line-height: 1.45;
}

/* CTA STRIP */
.cta {
  margin-top: ${variant === "portrait" ? "3mm" : "1.5mm"};
  padding: ${variant === "portrait" ? "16px 18px" : "9px 10px"};
  border-radius: ${variant === "portrait" ? "16px" : "10px"};
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  display: flex;
  flex-direction: column;
  gap: ${variant === "portrait" ? "10px" : "6px"};
}
.cta-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: ${variant === "portrait" ? "16px" : "8px"};
  flex-wrap: wrap;
}
.cta-pill {
  display: inline-flex; align-items: center; gap: 7px;
  padding: ${variant === "portrait" ? "8px 14px" : "5px 8px"};
  border-radius: 999px;
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.18);
  font-size: ${variant === "portrait" ? "10.5pt" : "6.5pt"};
  font-weight: 700;
  color: #fff;
  text-decoration: none;
}
.cta-pill svg { width: ${variant === "portrait" ? "16px" : "11px"}; height: ${variant === "portrait" ? "16px" : "11px"}; color: #a5b4fc; }
.cta-pill .value { direction: ltr; }
.cta-pill.primary {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border-color: transparent;
  color: #0b1020;
  box-shadow: 0 8px 22px rgba(251,191,36,0.45);
}
.cta-pill.primary svg { color: #0b1020; }
.blessing {
  text-align: center;
  font-size: ${variant === "portrait" ? "10pt" : "6.2pt"};
  font-weight: 700;
  color: #fde68a;
  padding-top: ${variant === "portrait" ? "4px" : "2px"};
  border-top: 1px dashed rgba(255,255,255,0.15);
}
`;

function buildCommonContent(variant: "portrait" | "mobile"): string {
  const isPortrait = variant === "portrait";
  const logoImg = LOGO
    ? `<img class="logo" src="${LOGO}" alt="BSD-YBM" />`
    : `<div class="logo"></div>`;

  const thumbs = (isPortrait
    ? [SHOT_HOME, SHOT_FINANCE, SHOT_AI]
    : [SHOT_HOME, SHOT_FINANCE]
  )
    .filter(Boolean)
    .map((src) => `<div class="thumb"><img src="${src}" alt=""/></div>`)
    .join("");

  const feats = FEATURES.map(
    (f) => `<div class="feat">
      <span class="feat-icon">${f.icon}</span>
      <div class="feat-text">
        <strong>${f.title}</strong>
        <span>${f.desc}</span>
      </div>
    </div>`,
  ).join("");

  return `
<div class="grid-bg"></div>

<div class="bsd-top">בסיעתא דשמיא</div>

<div class="head">
  ${logoImg}
  <div>
    <div class="brand-name">BSD-YBM OS</div>
    <div class="brand-tag">CRM · ERP · AI · OPERATING SYSTEM</div>
  </div>
  <div class="badge"><span class="dot"></span>100% מודולרי</div>
</div>

<div class="hero">
  <span class="eyebrow">מערכת הפעלה לעסק</span>
  <h1>bsd-ybm <span class="grad">פתרונות AI</span></h1>
  <p class="hero-tagline">"השדרה שמחברת בין כולם"</p>
  <p class="sub">פלטפורמה אחת בעברית שמאחדת CRM, פרויקטים, פיננסים, יומן Google, ארכיון מסמכים, Field Copilot לשטח ועוזר קולי Gemini Live — תחת חלונות צפים וממשק שמרגיש כמו macOS לעסק. מותאמת לקבלני בנייה, מנהלי פרויקטים, צוותי כספים ובעלי עסקים.</p>
</div>

<div class="strip">${thumbs}</div>

<div class="feats">${feats}</div>

<div class="modular">
  <div class="modular-icon">${I.zap}</div>
  <div class="modular-text">
    <strong>בנוי מודולרית — מתאים את עצמו אליך, לא להפך</strong>
    <span>כל מודול נערך, משונה או מתעדכן לפי בקשת הלקוח · אפשר להוסיף מערכות שלמות קיימות ולמזג אותן באתר באופן מושלם</span>
  </div>
</div>

<div class="cta">
  <div class="cta-row">
    <a class="cta-pill primary" href="https://bsd-ybm.co.il">
      ${I.globe}<span class="value">bsd-ybm.co.il</span>
    </a>
    <a class="cta-pill" href="tel:+972525640021">
      ${I.phone}<span>יוחנן בוקשפן · <span class="value">052-564-0021</span></span>
    </a>
  </div>
  <div class="blessing">בעזרת ה' נעשה ונצליח 🙏</div>
</div>
`;
}

export function buildMarketingOnePagerHtml(variant: "portrait" | "mobile"): string {
  return `<!doctype html>
<html lang="he" dir="rtl">
<head>
<meta charset="utf-8" />
<title>BSD-YBM OS · One Pager</title>
<style>${SHARED_CSS(variant)}</style>
</head>
<body>
<section class="page">${buildCommonContent(variant)}</section>
</body>
</html>`;
}
