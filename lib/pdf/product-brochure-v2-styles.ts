import { fontFaceCss } from "@/lib/pdf/product-brochure-v2-assets";

const PRODUCT_BROCHURE_V2_BASE_CSS = `
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
`;

export function productBrochureV2StylesCss(): string {
  return fontFaceCss() + PRODUCT_BROCHURE_V2_BASE_CSS;
}
