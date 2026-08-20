export const BROCHURE_SECTIONS_CSS = `
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
`;
