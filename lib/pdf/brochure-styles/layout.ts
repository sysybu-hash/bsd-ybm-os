export const BROCHURE_LAYOUT_CSS = `
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
`;
