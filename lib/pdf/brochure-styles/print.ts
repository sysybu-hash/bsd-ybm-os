export const BROCHURE_PRINT_CSS = `
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
