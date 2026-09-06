import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { inferRoomKind, isBuildingCoreRoom, type FloorplanLayout, type FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import {
  KIND_LABEL_HE,
  buildPlanOverviewCopy,
  buildViewCaption,
  formatFloorLabel,
  formatRoomMeasure,
  uniqueHeadingParts,
} from "@/lib/projects/floorplan-viz-explanations";

export type FloorplanVizPdfImage = FloorplanVizImage;

function fontFaceCss(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400;
  src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700;
  src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

function logoDataUrl(): string | null {
  const files = [
    path.join(process.cwd(), "public", "logos", "logo-night.png"),
    path.join(process.cwd(), "public", "logos", "logo-day-transparent.png"),
    path.join(process.cwd(), "assets", "logo-bsd-ybm-center.png"),
  ];
  for (const full of files) {
    if (!fs.existsSync(full)) continue;
    return `data:image/png;base64,${fs.readFileSync(full).toString("base64")}`;
  }
  return null;
}

function evidenceHe(source?: string): string {
  if (source === "ocr_verified") return "אומת ב-OCR";
  if (source === "consensus") return "הסכמת מנועים";
  return "השערה";
}

export function buildFloorplanVizPdfHtml(
  layout: FloorplanLayout,
  images: FloorplanVizPdfImage[],
  extras?: {
    projectName?: string;
    producedAt?: Date;
    locators?: Array<{ mimeType: string; base64: string } | null>;
    styleLabelHe?: string;
    styleSummaryHe?: string;
    /**
     * The sheet the still was generated from. When given, the booklet opens with
     * the still, the sheet, and the two side by side — the spread a buyer is
     * actually shown, and the one that lets anyone check the render against the
     * drawing without leaving the document.
     */
    planImage?: { mimeType: string; base64: string } | null;
    /**
     * Three pages and nothing else: the still, the sheet, the two side by side.
     * The cover and its room table are useful when the booklet is the whole
     * deliverable, and in the way when it is the comparison a client is being
     * walked through. Needs planImage — without a sheet there is nothing to
     * compare against, so the flag is ignored.
     */
    comparisonOnly?: boolean;
  },
): string {
  const fonts = fontFaceCss();
  const logo = logoDataUrl();
  const producedAt = extras?.producedAt ?? new Date();
  const dateHe = producedAt.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeHe = producedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const heading =
    uniqueHeadingParts([layout.title, layout.unitLabel, extras?.projectName]) || "דירה לפי תוכנית מכר";
  const overviewParas = buildPlanOverviewCopy(layout, extras?.projectName, {
    labelHe: extras?.styleLabelHe,
    summaryHe: extras?.styleSummaryHe,
  });
  const overview = images.filter((img) => img.viewId === "overview" || img.viewId === "isometric");
  const interiors = images.filter((img) => img.viewId === "interior");
  const ordered = [...overview, ...interiors];

  const floorLabel = formatFloorLabel(layout.floor);
  const kpis = [
    layout.grossAreaM2 != null ? { label: "שטח ברוטו", value: `${layout.grossAreaM2} מ"ר` } : null,
    layout.rooms.filter((r) => !isBuildingCoreRoom(r)).length > 0
      ? { label: "חללים", value: String(layout.rooms.filter((r) => !isBuildingCoreRoom(r)).length) }
      : null,
    floorLabel ? { label: "קומה", value: floorLabel } : null,
    layout.ceilingHeightM != null ? { label: "גובה תקרה", value: `${layout.ceilingHeightM} מ'` } : null,
  ].filter((row): row is { label: string; value: string } => row != null);

  const kpiHtml = kpis
    .map(
      (k) => `<div class="kpi"><span class="kpi-label">${escapeHtml(k.label)}</span><strong>${escapeHtml(k.value)}</strong></div>`,
    )
    .join("");

  const parasHtml = overviewParas.map((p) => `<p>${escapeHtml(p)}</p>`).join("");

  const rowsHtml =
    layout.rooms.filter((r) => !isBuildingCoreRoom(r)).length === 0
      ? `<tr><td colspan="5" class="muted">לא חולצו חללים מהתוכנית</td></tr>`
      : layout.rooms
          .filter((r) => !isBuildingCoreRoom(r))
          .map((room) => {
            const kind = room.kind ?? inferRoomKind(room.name);
            return `<tr>
              <td>${escapeHtml(room.name)}</td>
              <td>${escapeHtml(KIND_LABEL_HE[kind])}</td>
              <td>${escapeHtml(formatRoomMeasure(room))}</td>
              <td>${room.areaM2 != null ? escapeHtml(`${room.areaM2} מ"ר`) : "—"}</td>
              <td>${escapeHtml(evidenceHe(room.source))}</td>
            </tr>`;
          })
          .join("");

  const plan = extras?.planImage;
  // When the source sheet is included the booklet opens with the still, the
  // drawing and the two side by side, so the hero still is not printed again
  // as its own plate — the same frame twice reads as a mistake.
  const comparisonOnly = Boolean(extras?.comparisonOnly && plan);
  const plates = comparisonOnly ? [] : plan && ordered.length > 0 ? ordered.slice(1) : ordered;
  const plateOffset = plates.length === ordered.length ? 0 : 1;
  const platesHtml = plates
    .map((img, i) => {
      const src = `data:${img.mimeType || "image/jpeg"};base64,${img.base64}`;
      const caption = buildViewCaption(img, layout);
      const kindLabel =
        img.viewId === "interior"
          ? KIND_LABEL_HE[inferRoomKind(img.roomName ?? img.labelHe)]
          : img.viewId === "overview"
            ? "מבט על"
            : "איזומטריה";
      const locator = extras?.locators?.[i + plateOffset];
      const locatorHtml = locator
        ? `<figure class="locator">
  <figcaption>האזור בתוכנית המקורית · מפת התמצאות</figcaption>
  <img src="data:${locator.mimeType || "image/jpeg"};base64,${locator.base64}" alt="מפת התמצאות" />
</figure>`
        : "";
      return `<section class="plate">
  <header class="plate-head">
    <span class="plate-kicker">${i + 1}/${plates.length} · ${escapeHtml(kindLabel)}</span>
    <h2>${escapeHtml(img.labelHe)}</h2>
  </header>
  <div class="frame">
    <img src="${src}" alt="${escapeHtml(img.labelHe)}" />
  </div>
  ${locatorHtml}
  <div class="caption">
    <p>${escapeHtml(caption)}</p>
  </div>
</section>`;
    })
    .join("\n");

  const heroStill = ordered[0];
  const comparisonHtml =
    plan && heroStill
      ? `<section class="plate">
  <header class="plate-head">
    <span class="plate-kicker">1/3 · הדמיה</span>
    <h2>${escapeHtml(heroStill.labelHe)}</h2>
  </header>
  <div class="frame">
    <img src="data:${heroStill.mimeType || "image/jpeg"};base64,${heroStill.base64}" alt="${escapeHtml(heroStill.labelHe)}" />
  </div>
</section>
<section class="plate">
  <header class="plate-head">
    <span class="plate-kicker">2/3 · מקור</span>
    <h2>התוכנית המקורית</h2>
  </header>
  <div class="frame">
    <img src="data:${plan.mimeType || "image/jpeg"};base64,${plan.base64}" alt="התוכנית המקורית" />
  </div>
</section>
<section class="plate">
  <header class="plate-head">
    <span class="plate-kicker">3/3 · השוואה</span>
    <h2>הדמיה מול התוכנית</h2>
  </header>
  <div class="compare">
    <figure>
      <img src="data:${heroStill.mimeType || "image/jpeg"};base64,${heroStill.base64}" alt="הדמיה" />
      <figcaption>הדמיה</figcaption>
    </figure>
    <figure>
      <img src="data:${plan.mimeType || "image/jpeg"};base64,${plan.base64}" alt="התוכנית המקורית" />
      <figcaption>התוכנית המקורית</figcaption>
    </figure>
  </div>
</section>`
      : "";

  const brandMark = logo
    ? `<img class="logo" src="${logo}" alt="BSD-YBM" />`
    : `<div class="wordmark"><b>BY</b> bsd-ybm</div>`;

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(`הדמיות — ${heading}`)}</title>
<style>
${fonts}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body {
  margin: 0;
  padding: 0;
  padding-inline-start: 8mm;
  padding-inline-end: 3mm;
  font-family: "NotoHebrew", "Segoe UI", Arial, sans-serif;
  color: #1c1917;
  background: #fff;
  direction: rtl;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
  font-size: 11px;
  line-height: 1.5;
  overflow-x: hidden;
  max-width: 100%;
}
img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
h1, h2, h3 {
  margin: 0;
  font-weight: 700;
  overflow-wrap: anywhere;
  word-break: break-word;
}
p, span, td, th, li, figcaption {
  overflow-wrap: anywhere;
  word-break: break-word;
}
p { margin: 0 0 8px; orphans: 2; widows: 2; }
.cover { max-width: 100%; padding-inline-start: 2mm; }
.hero {
  background: linear-gradient(135deg, #1e1b4b 0%, #312e81 52%, #4f46e5 100%);
  color: #fff;
  border-radius: 14px;
  padding: 14px 20px 12px 16px;
  margin-bottom: 12px;
  overflow: hidden;
}
.hero-top {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-bottom: 10px;
}
.logo { height: 32px; width: auto; object-fit: contain; flex: 0 0 auto; }
.wordmark { font-size: 16px; }
.hero-meta {
  font-size: 10px;
  opacity: 0.85;
  margin-inline-start: auto;
  direction: rtl;
  text-align: start;
  white-space: nowrap;
}
.hero h1 { font-size: 18px; line-height: 1.3; margin-bottom: 4px; }
.hero .sub { font-size: 11px; opacity: 0.92; overflow-wrap: anywhere; }
.kpis { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.kpi {
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.18);
  border-radius: 10px;
  padding: 7px 10px;
  min-width: 72px;
  max-width: 100%;
}
.kpi strong { overflow-wrap: anywhere; }
.kpi-label { display: block; font-size: 9px; opacity: 0.8; margin-bottom: 2px; }
.section-title {
  font-size: 13px;
  margin: 12px 0 8px;
  padding-bottom: 4px;
  border-bottom: 2px solid #c4b5fd;
}
.narrative p { font-size: 11px; max-width: 100%; }
table {
  width: 100%;
  max-width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  margin: 6px 0 10px;
}
thead { display: table-header-group; }
tr { break-inside: avoid; page-break-inside: avoid; }
th, td {
  border: 1px solid #e7e5e4;
  padding: 5px 10px 5px 6px;
  text-align: right;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}
th { background: #f5f3ff; font-size: 9px; color: #4c1d95; }
td { font-size: 10px; background: #fff; }
th:nth-child(1), td:nth-child(1) { width: 28%; }
th:nth-child(2), td:nth-child(2) { width: 16%; }
th:nth-child(3), td:nth-child(3) { width: 22%; }
th:nth-child(4), td:nth-child(4) { width: 16%; }
th:nth-child(5), td:nth-child(5) { width: 18%; }
.note {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 10px;
  color: #78350f;
}
.brand-line {
  margin-top: 10px;
  font-size: 9px;
  color: #57534e;
  text-align: center;
}
.plate {
  break-before: page;
  page-break-before: always;
  height: 250mm;
  max-height: 250mm;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-width: 100%;
  padding-inline-start: 4mm;
}
/* Without a cover the first plate is the first page; a forced break there can
   cost a blank leading sheet. */
body > .plate:first-child {
  break-before: auto;
  page-break-before: auto;
}
.plate-head { flex: 0 0 auto; margin-bottom: 6px; min-width: 0; }
/* Two panels on one page, each scaled to fit its half rather than cropped, so
   the render and the drawing can be held against each other at a glance. */
.compare {
  flex: 1 1 auto;
  display: flex;
  gap: 6mm;
  min-height: 0;
  align-items: stretch;
}
.compare figure {
  flex: 1 1 50%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  margin: 0;
}
.compare img {
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  object-fit: contain;
  border: 1px solid #e7e5e4;
  border-radius: 3px;
  background: #fff;
}
.compare figcaption {
  flex: 0 0 auto;
  margin-top: 4px;
  font-size: 9px;
  color: #57534e;
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
  flex: 1 1 auto;
  min-height: 0;
  background: #0f172a;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  overflow: hidden;
}
.frame img { width: auto; height: auto; max-width: 100%; max-height: 100%; object-fit: contain; }
.caption {
  flex: 0 0 auto;
  margin-top: 8px;
  background: #fafaf9;
  border: 1px solid #e7e5e4;
  border-radius: 10px;
  padding: 8px 14px 8px 10px;
  max-height: 22mm;
  overflow: hidden;
}
.caption p { margin: 0; font-size: 10px; line-height: 1.45; }
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
</style>
</head>
<body>
  ${comparisonOnly ? "" : `<section class="cover">
    <div class="hero">
      <div class="hero-top">
        ${brandMark}
        <div>
          <div class="sub">BSD-YBM OS · חוברת הדמיות תוכנית</div>
        </div>
        <div class="hero-meta">${escapeHtml(dateHe)} ${escapeHtml(timeHe)}</div>
      </div>
      <h1>${escapeHtml(heading)}</h1>
      <p class="sub">הדמיות תלת־ממד מעוגנות בתוכנית המכר / גרמושקה</p>
      ${kpis.length ? `<div class="kpis">${kpiHtml}</div>` : ""}
    </div>
    <h2 class="section-title">הסבר ראשי על התוכנית</h2>
    <div class="narrative">${parasHtml}</div>
    <h2 class="section-title">חללים שזוהו</h2>
    <table>
      <thead>
        <tr>
          <th>תיאור</th>
          <th>סוג</th>
          <th>מידות</th>
          <th>שטח</th>
          <th>ראיה</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
    <div class="note">
      ההדמיות הן המחשה ויזואלית. המידות בטבלה מגיעות מפענוח התוכנית (OCR ומנועי ראייה) — אין למדוד מהתמונות.
      מסמך זה הופק על ידי מערכת BSD-YBM.
    </div>
    <p class="brand-line">הופק על ידי מערכת BSD-YBM · ${escapeHtml(dateHe)}</p>
  </section>`}
  ${comparisonHtml}
  ${platesHtml}
</body>
</html>`;
}
