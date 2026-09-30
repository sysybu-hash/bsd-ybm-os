import { BSD_YBM_LOGO_PNG_BASE64 } from "@/lib/pdf/font-data.generated";
import { escapeHtml } from "@/lib/pdf/invoice-labels";
import { loadPdfFontBuffers } from "@/lib/pdf/load-pdf-font-buffers";
import { BOOKLET_CSS } from "@/lib/projects/viz-pdf/booklet-css";

/**
 * A building's visualisation booklet, in the system's own booklet design — the
 * same cover, header, frame and plaque as a flat's — laid out in A3 landscape,
 * the shape of the sheets it is drawn from.
 *
 * Every sheet of the permit set gets the flat booklet's spread: the render,
 * the sheet, and the two side by side at the same frame, so the render can be
 * checked against the drawing without leaving the document. Interiors and
 * perspectives follow as plates.
 */
export type BookletImage = { mimeType: string; base64: string };

export type BuildingBookletSheet = {
  no: number;
  title: string;
  caption: string;
  sheet: BookletImage;
  render: BookletImage;
};

export type BuildingBookletPlate = { kicker: string; title: string; caption: string; image: BookletImage };

export type BuildingBookletInput = {
  projectName: string;
  subtitle: string;
  architect: string;
  producedAt?: Date;
  hero: BookletImage;
  kpis: Array<{ label: string; value: string }>;
  paragraphs: string[];
  rooms: Array<{ name: string; floor: string; area: string }>;
  sheets: BuildingBookletSheet[];
  plates: BuildingBookletPlate[];
};

/** A3 landscape, in CSS pixels and PDF points. */
export const BUILDING_BOOKLET_PAGE = { cssWidth: 1587, cssHeight: 1123, ptWidth: 1190.55, ptHeight: 841.89 };

const SITE = "https://www.bsd-ybm.co.il";
const link = (html: string) => `<a class="brand-link" href="${SITE}" target="_blank" rel="noopener noreferrer">${html}</a>`;
const src = (img: BookletImage) => `data:${img.mimeType || "image/jpeg"};base64,${img.base64}`;

const LANDSCAPE_CSS = `
@page { size: 420mm 297mm; margin: 0; }
.cover, .plate { width: ${BUILDING_BOOKLET_PAGE.cssWidth}px; height: ${BUILDING_BOOKLET_PAGE.cssHeight}px; max-height: ${BUILDING_BOOKLET_PAGE.cssHeight}px; }
body { font-size: 13px; }
.cover { padding: 0 34px 26px; }
.cover-brand { margin: 0 -34px 16px; }
.cover-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1.25fr 1fr; gap: 22px; }
.cover-photo { min-height: 0; border-radius: 16px; overflow: hidden; background: #fff; border: 2px solid #1e1b4b; }
.cover-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.cover-copy { min-height: 0; display: flex; flex-direction: column; }
.hero h1 { font-size: 34px; }
.narrative p { font-size: 13px; }
td { font-size: 12px; padding: 6px 10px; } th { padding: 6px 10px; }
th:nth-child(1), td:nth-child(1) { width: 58%; } th:nth-child(2), td:nth-child(2) { width: 22%; } th:nth-child(3), td:nth-child(3) { width: 20%; }
.rooms-table-wrap { overflow: hidden; }
.page-logo { height: 46px; max-height: 46px; }
.gallery-kicker { font-size: 13px; }
.plaque-unit strong, .plaque-area strong { font-size: 24px; }
.plaque-caption { max-width: 1100px; margin: 6px auto 0; font-size: 13px; color: #e0e7ff; }
.compare figcaption { font-size: 13px; }
.sheet-no { font-variant-numeric: tabular-nums; }
`;

function fonts(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400; src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700; src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

export function buildBuildingBookletHtml(input: BuildingBookletInput): string {
  const logo = BSD_YBM_LOGO_PNG_BASE64
    ? `<img class="page-logo" src="data:image/png;base64,${BSD_YBM_LOGO_PNG_BASE64}" alt="BSD-YBM" />`
    : `<span class="gallery-wordmark">BSD-YBM</span>`;
  const pageLogo = link(logo);
  const at = input.producedAt ?? new Date();
  const dateHe = at.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeHe = at.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const produced = link(escapeHtml("הופק ע״י מערכת BSD-YBM"));
  const total = input.sheets.length * 3 + input.plates.length + 1;
  let page = 1;
  const kicker = (text: string) => `${++page}/${total} · ${text}`;
  const top = (text: string) => `<header class="gallery-top">${pageLogo}<span class="gallery-kicker">${escapeHtml(text)}</span></header>`;
  const plaque = (label: string, value: string, caption?: string) => `<footer class="gallery-plaque">
    <div class="plaque-main"><div class="plaque-unit"><span class="plaque-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>
    ${caption ? `<p class="plaque-caption">${escapeHtml(caption)}</p>` : ""}
    <div class="plaque-produced">${produced}</div>
  </footer>`;
  const compact = `<footer class="gallery-plaque gallery-plaque-compact"><div class="plaque-produced">${produced}</div></footer>`;
  const framed = (img: BookletImage, alt: string, ornament = true) => `<div class="master-stage">
    <div class="ornament-frame${ornament ? "" : " ornament-frame-plain"}">
      ${ornament ? `<span class="corner corner-tl"></span><span class="corner corner-tr"></span><span class="corner corner-bl"></span><span class="corner corner-br"></span>` : ""}
      <div class="master-mat"><img src="${src(img)}" alt="${escapeHtml(alt)}" /></div>
    </div>
  </div>`;

  const sheetPages = input.sheets
    .map((s) => {
      const label = `גיליון ${s.no} · ${s.title}`;
      return `<section class="plate plate-master">
  ${top(kicker(`גיליון ${s.no} · הדמיה`))}
  ${framed(s.render, s.title)}
  ${plaque(label, "הדמיה", s.caption)}
</section>
<section class="plate plate-gallery">
  ${top(kicker(`גיליון ${s.no} · תוכנית`))}
  ${framed(s.sheet, s.title, false)}
  ${plaque(label, "הגיליון בחוברת ההגשה")}
</section>
<section class="plate plate-gallery plate-compare">
  ${top(kicker(`גיליון ${s.no} · השוואה`))}
  <div class="master-stage"><div class="compare">
    <figure><figcaption>הדמיה</figcaption><div class="compare-frame"><img src="${src(s.render)}" alt="הדמיה" /></div></figure>
    <figure><figcaption>הגיליון</figcaption><div class="compare-frame"><img src="${src(s.sheet)}" alt="הגיליון" /></div></figure>
  </div></div>
  ${compact}
</section>`;
    })
    .join("\n");

  const platePages = input.plates
    .map(
      (p) => `<section class="plate plate-master">
  ${top(kicker(p.kicker))}
  ${framed(p.image, p.title)}
  ${plaque(p.kicker, p.title, p.caption)}
</section>`,
    )
    .join("\n");

  const kpis = input.kpis
    .map((k) => `<div class="kpi"><span class="kpi-label">${escapeHtml(k.label)}</span><strong>${k.value}</strong></div>`)
    .join("");
  const rows = input.rooms
    .map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.floor}</td><td>${escapeHtml(r.area)}</td></tr>`)
    .join("");

  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"/>
<title>${escapeHtml(`הדמיות — ${input.projectName}`)}</title>
<style>${fonts()}${BOOKLET_CSS}${LANDSCAPE_CSS}</style>
</head><body>
<section class="cover">
  <div class="cover-brand">${pageLogo}<span class="cover-kicker">1/${total} · שער</span></div>
  <div class="cover-grid">
    <div class="cover-photo"><img src="${src(input.hero)}" alt="${escapeHtml(input.projectName)}" /></div>
    <div class="cover-copy">
      <div class="hero">
        <div class="hero-top"><div class="sub">${link("BSD-YBM")} · חוברת הדמיה</div><div class="hero-meta">${escapeHtml(dateHe)} ${escapeHtml(timeHe)}</div></div>
        <h1>${escapeHtml(input.projectName)}</h1>
        <p class="sub">${escapeHtml(input.subtitle)} · ${escapeHtml(input.architect)}</p>
        <div class="kpis">${kpis}</div>
      </div>
      <h2 class="section-title">על הפרויקט</h2>
      <div class="narrative">${input.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
      <div class="rooms-table-wrap">
        <h2 class="section-title">חללי המבנה</h2>
        <table><thead><tr><th>חלל</th><th>קומה</th><th>שטח</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
      <div class="note">ההדמיות להמחשה בלבד. המידות והשטחים לפי חוברת ההגשה. אין למדוד מהתמונה.</div>
      <div class="produced-bar" style="margin-top:12px">${link(`הופק על ידי מערכת BSD-YBM · ${escapeHtml(dateHe)} ${escapeHtml(timeHe)}`)}</div>
    </div>
  </div>
</section>
${sheetPages}
${platePages}
</body></html>`;
}
