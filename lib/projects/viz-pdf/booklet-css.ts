/**
 * The booklet's print stylesheet.
 *
 * A4 at 794×1123 with every plate a fixed-height grid, because Chromium
 * screenshots each section as one page. Kept apart from the markup so the
 * builder reads as the document it assembles.
 */
export const BOOKLET_CSS = `
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  font-family: "NotoHebrew", "Segoe UI", Arial, sans-serif;
  color: #1c1917;
  background: #fff;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-size: 11px;
  line-height: 1.5;
  overflow: hidden;
  max-width: 100%;
}
a.brand-link {
  color: inherit;
  text-decoration: none;
  cursor: pointer;
}
a.brand-link:hover { opacity: 0.88; }
h1, h2, h3 {
  margin: 0;
  font-weight: 700;
}
td, th {
  overflow-wrap: anywhere;
}
p { margin: 0 0 8px; orphans: 2; widows: 2; }
.cover {
  box-sizing: border-box;
  width: 794px;
  height: 1123px;
  max-height: 1123px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  padding: 0 26px 20px;
}
.cover-brand {
  display: flex;
  direction: ltr;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 -26px 12px;
  padding: 8px 18px 8px 14px;
  background: #1e1b4b;
  min-width: 0;
}
.cover-kicker {
  display: block;
  font-size: 10px;
  font-weight: 700;
  color: #c4b5fd;
  letter-spacing: 0.04em;
  margin: 0;
  direction: rtl;
}
.folio {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
  margin: 4px 0 12px;
}
.folio-step {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 12px;
  padding: 10px 6px;
  text-align: center;
}
.folio-step b {
  display: block;
  font-size: 18px;
  line-height: 1.1;
  color: #4f46e5;
  margin-bottom: 2px;
}
.folio-step span { font-size: 10px; color: #4c1d95; }
.hero {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 52%, #4f46e5 100%);
  color: #fff;
  border-radius: 16px;
  padding: 16px 18px 14px 16px;
  margin-bottom: 12px;
  overflow: hidden;
  flex: 0 0 auto;
}
.hero-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.logo { height: 32px; width: auto; object-fit: contain; flex: 0 0 auto; }
.page-logo {
  height: 42px;
  width: auto;
  max-height: 42px;
  object-fit: contain;
  flex: 0 0 auto;
}
.wordmark { font-size: 16px; }
.hero-meta {
  font-size: 10px;
  opacity: 0.85;
  margin-inline-start: auto;
  direction: rtl;
  text-align: start;
  white-space: nowrap;
}
.hero h1 { font-size: 28px; line-height: 1.2; margin-bottom: 6px; }
.hero .sub { font-size: 12px; opacity: 0.92; overflow-wrap: anywhere; }
.kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 0; }
.kpi {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 10px;
  padding: 8px 12px;
  min-width: 80px;
  max-width: 100%;
}
.kpi strong { overflow-wrap: anywhere; font-size: 13px; }
.kpi-label { display: block; font-size: 10px; opacity: 0.8; margin-bottom: 2px; }
.section-title {
  font-size: 15px;
  margin: 14px 0 8px;
  padding-bottom: 5px;
  border-bottom: 2px solid #c4b5fd;
  flex: 0 0 auto;
}
.narrative { flex: 0 0 auto; }
.narrative p { font-size: 12px; line-height: 1.55; max-width: 100%; margin: 0 0 8px; }
.rooms-table-wrap {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
table {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin: 4px 0 12px;
  flex: 0 0 auto;
}
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td {
  border: 1px solid #e7e5e4;
  padding: 8px 12px 8px 8px;
  text-align: right;
  vertical-align: middle;
  overflow-wrap: anywhere;
}
th { background: #f5f3ff; font-size: 11px; color: #4c1d95; font-weight: 700; }
td { font-size: 12px; background: #fff; line-height: 1.4; }
th:nth-child(1), td:nth-child(1) { width: 34%; }
th:nth-child(2), td:nth-child(2) { width: 18%; }
th:nth-child(3), td:nth-child(3) { width: 26%; }
th:nth-child(4), td:nth-child(4) { width: 22%; }
.note {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 11px;
  color: #78350f;
  flex: 0 0 auto;
}
.brand-line {
  display: none;
}
.produced-bar {
  flex: 0 0 auto;
  margin-top: auto;
  background: #1e1b4b;
  color: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  text-align: center;
  font-size: 11px;
  font-weight: 700;
}
.plate {
  box-sizing: border-box;
  break-before: page;
  page-break-before: always;
  width: 794px;
  height: 1123px;
  max-height: 1123px;
  overflow: hidden;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  padding: 12px 16px 10px;
}
.plate-master,
.plate-gallery {
  padding: 0;
  background: #f4f1ea;
}
.plate-master { background: #efeae2; }
/* Without a cover the first plate is the first page; a forced break there can
   cost a blank leading sheet. */
body > .plate:first-child {
  break-before: auto;
  page-break-before: auto;
}
.gallery-top {
  grid-row: 1;
  display: flex;
  direction: ltr;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #1e1b4b;
  color: #fff;
  padding: 8px 18px 8px 14px;
  min-width: 0;
}
.gallery-wordmark {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: #e0e7ff;
}
.gallery-kicker {
  font-size: 10px;
  font-weight: 700;
  color: #c4b5fd;
  white-space: nowrap;
  direction: rtl;
}
.master-stage {
  grid-row: 2;
  min-height: 0;
  padding: 16px 20px 12px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ornament-frame {
  position: relative;
  flex: 1 1 auto;
  min-height: 0;
  background: #fff;
  border: 2px solid #1e1b4b;
  padding: 12px;
}
.ornament-frame::before {
  content: "";
  position: absolute;
  inset: 6px;
  border: 1px solid #c4b5fd;
  pointer-events: none;
}
.ornament-frame-plain { padding: 8px; }
.corner {
  position: absolute;
  width: 16px;
  height: 16px;
  border-color: #4f46e5;
  border-style: solid;
  z-index: 2;
  pointer-events: none;
}
.corner-tl { top: 8px; left: 8px; border-width: 2px 0 0 2px; }
.corner-tr { top: 8px; right: 8px; border-width: 2px 2px 0 0; }
.corner-bl { bottom: 8px; left: 8px; border-width: 0 0 2px 2px; }
.corner-br { bottom: 8px; right: 8px; border-width: 0 2px 2px 0; }
.master-mat {
  height: 100%;
  min-height: 0;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.master-mat img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center;
}
.gallery-plaque {
  grid-row: 3;
  background: #1e1b4b;
  color: #fff;
  padding: 12px 22px 14px;
  text-align: center;
}
.gallery-plaque-compact {
  padding: 8px 22px;
}
.plaque-main {
  display: flex;
  align-items: stretch;
  justify-content: center;
  gap: 28px;
}
.plaque-label {
  display: block;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #c4b5fd;
  margin-bottom: 2px;
}
.plaque-unit strong,
.plaque-area strong {
  display: block;
  font-size: 22px;
  line-height: 1.15;
  font-weight: 700;
}
.plaque-rule {
  width: 1px;
  background: rgba(196,181,253,0.45);
}
.plaque-note {
  margin: 8px 0 0;
  font-size: 10px;
  color: #e0e7ff;
  font-weight: 400;
}
.plaque-produced {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.04em;
}
.plate-head {
  grid-row: 1;
  margin-bottom: 4px;
  min-width: 0;
  display: flex;
  direction: ltr;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.plate-head-copy {
  min-width: 0;
  text-align: right;
  direction: rtl;
}
/* Two panels on one page, each scaled to fit its half rather than cropped, so
   the render and the drawing can be held against each other at a glance. */
.compare {
  flex: 1 1 0%;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  min-height: 0;
  height: 100%;
  align-items: stretch;
}
.compare figure {
  min-width: 0;
  min-height: 0;
  height: 100%;
  max-height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  margin: 0;
  overflow: hidden;
}
.compare-frame {
  position: relative;
  flex: 1 1 0%;
  min-height: 0;
  background: #fff;
  border: none;
  overflow: hidden;
}
.compare-frame img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  max-width: none;
  max-height: none;
  object-fit: contain;
  object-position: center;
}
.compare figcaption {
  flex: 0 0 auto;
  margin: 0 0 8px;
  font-size: 10px;
  font-weight: 700;
  color: #1e1b4b;
  text-align: center;
}
.plate-kicker {
  display: block;
  font-size: 9px;
  color: #6d28d9;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.plate-head h2 { font-size: 14px; margin-top: 2px; line-height: 1.3; }
.frame {
  grid-row: 2;
  min-height: 0;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
}
.frame img {
  width: 100%;
  height: 100%;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  object-position: center;
}
.frame-sheet { background: #f8fafc; }
.caption {
  grid-row: 3;
  margin-top: 6px;
  background: #f5f3ff;
  border: 1px solid #c4b5fd;
  border-radius: 10px;
  padding: 7px 12px;
  min-height: 36px;
  color: #1c1917;
}
.caption p {
  margin: 0;
  font-size: 12px;
  line-height: 1.4;
  font-weight: 700;
  color: #1c1917;
}
.locator {
  flex: 0 0 40mm;
  margin-top: 6px;
  overflow: hidden;
  min-width: 0;
}
.locator figcaption {
  font-size: 9px;
  font-weight: 700;
  color: #6d28d9;
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.locator img {
  width: 100%;
  height: 34mm;
  object-fit: contain;
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  border-radius: 8px;
}
.muted { color: #78716c; text-align: center; }
`;
