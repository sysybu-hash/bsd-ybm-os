import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { roomsForBookletTable } from "@/lib/projects/floorplan-booklet-rooms";
import { inferRoomKind, type FloorplanLayout, type FloorplanVizImage } from "@/lib/projects/floorplan-layout";
import { bookletHeroImage } from "@/lib/projects/floorplan-viz-ids";
import {
  KIND_LABEL_HE,
  bookletUnitHeading,
  buildPlanOverviewCopy,
  buildViewCaption,
  formatFloorLabel,
  formatRoomArea,
  formatRoomMeasure,
} from "@/lib/projects/floorplan-viz-explanations";

export type FloorplanVizPdfImage = FloorplanVizImage;

const BSD_YBM_SITE = "https://www.bsd-ybm.co.il";

function brandLink(innerHtml: string): string {
  return `<a class="brand-link" href="${BSD_YBM_SITE}" target="_blank" rel="noopener noreferrer">${innerHtml}</a>`;
}

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
    path.join(process.cwd(), "public", "logos", "logo-night-transparent.png"),
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

/** הסתייגות קצרה ללקוח — בלי שפת עיבוד פנימית. */
function measurementNoteHe(): string {
  return "ההדמיה להמחשה בלבד. המידות לפי תוכנית המכר. אין למדוד מהתמונה.";
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
     * Same drawing as page 3, optionally padded to the still's aspect so the
     * two frames share a scale. Never a tighter crop — that cut rooms.
     */
    comparePlanImage?: { mimeType: string; base64: string } | null;
    /**
     * Hero still padded to the compare plan's aspect so page 4 is the same
     * scale. Page 2 keeps the tight crop.
     */
    compareHeroImage?: { mimeType: string; base64: string } | null;
    /**
     * Three pages and nothing else: the still, the sheet, the two side by side.
     * The cover and its room table are useful when the booklet is the whole
     * deliverable, and in the way when it is the comparison a client is being
     * walked through. Needs planImage — without a sheet there is nothing to
     * compare against, so the flag is ignored.
     */
    comparisonOnly?: boolean;
    /** Extra stills after the four sales pages. Off by default when a sheet is present. */
    includeAllPlates?: boolean;
    /** Run / file title when the layout has no unit label. */
    unitTitle?: string;
  },
): string {
  const fonts = fontFaceCss();
  const logo = logoDataUrl();
  const pageLogo = brandLink(
    logo
      ? `<img class="page-logo" src="${logo}" alt="BSD-YBM" />`
      : `<span class="gallery-wordmark">BSD-YBM</span>`,
  );
  const producedAt = extras?.producedAt ?? new Date();
  const dateHe = producedAt.toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeHe = producedAt.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const heading = bookletUnitHeading(layout, extras?.unitTitle ?? extras?.projectName);
  const overviewParas = buildPlanOverviewCopy(layout, extras?.projectName, {
    labelHe: extras?.styleLabelHe,
    summaryHe: extras?.styleSummaryHe,
  });
  const overview = images.filter((img) => img.viewId === "overview" || img.viewId === "isometric");
  const interiors = images.filter((img) => img.viewId === "interior");
  const ordered = [...overview, ...interiors];

  const floorLabel = formatFloorLabel(layout.floor);
  const livingRooms = roomsForBookletTable(layout);
  const terraceM2 = livingRooms
    .filter((r) => (r.kind ?? inferRoomKind(r.name)) === "balcony")
    .reduce((sum, r) => sum + (r.areaM2 ?? 0), 0);
  const kpis = [
    { label: "יחידה", value: heading },
    {
      label: "שטח ברוטו",
      value: layout.grossAreaM2 != null ? `${layout.grossAreaM2} מ"ר` : "—",
    },
    livingRooms.length > 0 ? { label: "חללים", value: String(livingRooms.length) } : null,
    terraceM2 > 0 ? { label: "מרפסות", value: `${Number(terraceM2.toFixed(2))} מ"ר` } : null,
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
    livingRooms.length === 0
      ? `<tr><td colspan="4" class="muted">${
          layout.rooms.length > 0
            ? "חללים פנימיים לא הוצגו בטבלה. השטח הברוטו לפי תוכנית המכר."
            : "לא זוהו חללים בתוכנית"
        }</td></tr>`
      : livingRooms
          .map((room) => {
            const kind = room.kind ?? inferRoomKind(room.name);
            return `<tr>
              <td>${escapeHtml(room.name)}</td>
              <td>${escapeHtml(KIND_LABEL_HE[kind])}</td>
              <td>${escapeHtml(formatRoomMeasure(room))}</td>
              <td>${escapeHtml(formatRoomArea(room))}</td>
            </tr>`;
          })
          .join("");

  const plan = extras?.planImage;
  const comparePlan = extras?.comparePlanImage ?? plan;
  const compareHero = extras?.compareHeroImage ?? null;
  const comparisonOnly = Boolean(extras?.comparisonOnly && plan);
  const salesFour = Boolean(plan && !comparisonOnly && extras?.includeAllPlates !== true);
  // Sales booklet is cover + viz + sheet + compare. Extra stills (geometry
  // companion, interiors) turn a four-page deliverable into a scrapbook.
  const plates = comparisonOnly || salesFour ? [] : plan && ordered.length > 0 ? ordered.slice(1) : ordered;
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
    ${pageLogo}
    <div class="plate-head-copy">
      <span class="plate-kicker">${i + 1}/${plates.length} · ${escapeHtml(kindLabel)}</span>
      <h2>${escapeHtml(img.labelHe)}</h2>
    </div>
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

  const heroStill = bookletHeroImage(ordered);
  const compareStill = compareHero ?? heroStill;
  const vizKicker = comparisonOnly ? "1/3 · הדמיה" : "2/4 · הדמיה";
  const srcKicker = comparisonOnly ? "2/3 · תוכנית" : "3/4 · תוכנית";
  const cmpKicker = comparisonOnly ? "3/3 · השוואה" : "4/4 · השוואה";
  const areaHe = layout.grossAreaM2 != null ? `${layout.grossAreaM2} מ"ר` : "";
  const producedByHe = "הופק ע״י מערכת BSD-YBM";
  const producedByHtml = brandLink(escapeHtml(producedByHe));
  const galleryHeader = (kicker: string) => `<header class="gallery-top">
    ${pageLogo}
    <span class="gallery-kicker">${escapeHtml(kicker)}</span>
  </header>`;
  const galleryPlaque = (opts?: { note?: string; compact?: boolean }) =>
    opts?.compact
      ? `<footer class="gallery-plaque gallery-plaque-compact">
    ${opts.note ? `<p class="plaque-note">${escapeHtml(opts.note)}</p>` : ""}
    <div class="plaque-produced">${producedByHtml}</div>
  </footer>`
      : `<footer class="gallery-plaque">
    <div class="plaque-main">
      <div class="plaque-unit">
        <span class="plaque-label">יחידה</span>
        <strong>${escapeHtml(heading)}</strong>
      </div>
      ${
        areaHe
          ? `<div class="plaque-rule"></div>
      <div class="plaque-area">
        <span class="plaque-label">שטח ברוטו</span>
        <strong>${escapeHtml(areaHe)}</strong>
      </div>`
          : ""
      }
    </div>
    ${opts?.note ? `<p class="plaque-note">${escapeHtml(opts.note)}</p>` : ""}
    <div class="plaque-produced">${producedByHtml}</div>
  </footer>`;
  const comparisonHtml =
    plan && heroStill && compareStill && comparePlan
      ? `<section class="plate plate-master">
  ${galleryHeader(vizKicker)}
  <div class="master-stage">
    <div class="ornament-frame">
      <span class="corner corner-tl"></span>
      <span class="corner corner-tr"></span>
      <span class="corner corner-bl"></span>
      <span class="corner corner-br"></span>
      <div class="master-mat">
        <img src="data:${heroStill.mimeType || "image/jpeg"};base64,${heroStill.base64}" alt="${escapeHtml(heroStill.labelHe)}" />
      </div>
    </div>
  </div>
  ${galleryPlaque()}
</section>
<section class="plate plate-gallery">
  ${galleryHeader(srcKicker)}
  <div class="master-stage">
    <div class="ornament-frame ornament-frame-plain">
      <div class="master-mat">
        <img src="data:${plan.mimeType || "image/jpeg"};base64,${plan.base64}" alt="תוכנית המכר" />
      </div>
    </div>
  </div>
  ${galleryPlaque({ compact: true })}
</section>
<section class="plate plate-gallery plate-compare">
  ${galleryHeader(cmpKicker)}
  <div class="master-stage">
    <div class="compare">
      <figure>
        <figcaption>הדמיה</figcaption>
        <div class="compare-frame">
          <img src="data:${compareStill.mimeType || "image/jpeg"};base64,${compareStill.base64}" alt="הדמיה" />
        </div>
      </figure>
      <figure>
        <figcaption>תוכנית המכר</figcaption>
        <div class="compare-frame">
          <img src="data:${comparePlan.mimeType || "image/jpeg"};base64,${comparePlan.base64}" alt="תוכנית המכר" />
        </div>
      </figure>
    </div>
  </div>
  ${galleryPlaque({ compact: true })}
</section>`
      : "";

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
</style>
</head>
<body>
  ${comparisonOnly ? "" : `<section class="cover">
    <div class="cover-brand">
      ${pageLogo}
      <span class="cover-kicker">${plan ? "1/4 · שער" : "שער"}</span>
    </div>
    <div class="hero">
      <div class="hero-top">
        <div>
          <div class="sub">${brandLink("BSD-YBM")} · חוברת הדמיה</div>
        </div>
        <div class="hero-meta">${escapeHtml(dateHe)} ${escapeHtml(timeHe)}</div>
      </div>
      <h1>${escapeHtml(heading)}</h1>
      <p class="sub">הדמיה תלת־ממד לפי תוכנית המכר</p>
      ${kpis.length ? `<div class="kpis">${kpiHtml}</div>` : ""}
    </div>
    ${plan ? `<div class="folio">
      <div class="folio-step"><b>1</b><span>שער</span></div>
      <div class="folio-step"><b>2</b><span>הדמיה</span></div>
      <div class="folio-step"><b>3</b><span>תוכנית</span></div>
      <div class="folio-step"><b>4</b><span>השוואה</span></div>
    </div>` : ""}
    <h2 class="section-title">על הדירה</h2>
    <div class="narrative">${parasHtml}</div>
    <div class="rooms-table-wrap">
      <h2 class="section-title">חללי הדירה</h2>
      <table>
        <thead>
          <tr>
            <th>תיאור</th>
            <th>סוג</th>
            <th>מידות</th>
            <th>שטח</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="note">
      ${escapeHtml(measurementNoteHe())}
    </div>
    <div class="produced-bar">${brandLink(`הופק על ידי מערכת BSD-YBM · ${escapeHtml(dateHe)} ${escapeHtml(timeHe)}`)}</div>
  </section>`}
  ${comparisonHtml}
  ${platesHtml}
</body>
</html>`;
}
