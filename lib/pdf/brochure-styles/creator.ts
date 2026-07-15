export const BROCHURE_CREATOR_CSS = `
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
`;
