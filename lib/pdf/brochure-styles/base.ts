export const BROCHURE_BASE_CSS = `

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
`;
