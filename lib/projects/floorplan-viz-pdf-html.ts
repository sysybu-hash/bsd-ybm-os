import fs from "node:fs";
import path from "node:path";
import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { BOOKLET_CSS } from "@/lib/projects/viz-pdf/booklet-css";
import { roomsForBookletTable, type PrintedUnitTruth } from "@/lib/projects/floorplan-booklet-rooms";
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
    /** The program printed on the sheet, which wins over a thinner CAD room list. */
    truth?: PrintedUnitTruth;
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
  const livingRooms = roomsForBookletTable(layout, extras?.truth);
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
${BOOKLET_CSS}
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
