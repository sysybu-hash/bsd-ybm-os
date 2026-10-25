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
export type BookletImage = { mimeType: string; base64: string; width?: number; height?: number };

export type BuildingBookletSheet = {
  no: number;
  title: string;
  caption: string;
  sheet: BookletImage;
  render: BookletImage;
  /** Written over the render where the sheet writes them: shares of the picture, a line each (HTML-escaped by the caller). */
  labels?: Array<{ fx: number; fy: number; lines: string[] }>;
  /**
   * A house plan's key: each room numbered on the plan and listed beside it with its name, its size and its area, a north arrow
   * and a scale. Names written over the picture stood partial and one-sided; a number is the same in both homes.
   */
  key?: PlanKey;
};

export type PlanKey = {
  rows: Array<{ n: number; name: string; dims: string; area: string }>;
  /** Shares of the render's width and height. */
  markers: Array<{ fx: number; fy: number; n: number }>;
  /** A bar of `metres` is `fraction` of the render's width. */
  scale: { fraction: number; metres: number };
  /** North in the plan's frame (x right, z down the picture). */
  north: { x: number; z: number };
};

/** A table of the booklet's data: its cells are HTML, escaped by whoever fills them. */
export type BookletTable = { title: string; note?: string; head: string[]; rows: string[][]; foot?: string[] };

export type BuildingBookletPlate = { kicker: string; title: string; caption: string; image: BookletImage };

/**
 * A project of several models in one booklet: one cover for the project, then
 * each model's chapter — its opening page, every sheet's render and its
 * comparison with the sheet, its outside views and its homes — and at the
 * end the review: what the check of each sheet against its render reported.
 * The pages are numbered through the whole booklet.
 */
export type ProjectBookletChapter = {
  name: string;
  hero: BookletImage;
  kpis: Array<{ label: string; value: string }>;
  paragraphs: string[];
  rooms: Array<{ name: string; floor: string; area: string }>;
  /** The model's data page, after its opening page: its rooms, levels and openings. None, no page. */
  tables?: BookletTable[];
  sheets: BuildingBookletSheet[];
  plates: BuildingBookletPlate[];
  /** What the check reported for this model, line by line (HTML): the appendix's. */
  report: string[];
};

export type ProjectBookletInput = {
  projectName: string;
  subtitle: string;
  producedAt?: Date;
  hero: BookletImage;
  kpis: Array<{ label: string; value: string }>;
  paragraphs: string[];
  /** The cover's tables, under its paragraphs: the project's data and how its models differ. */
  tables?: BookletTable[];
  chapters: ProjectBookletChapter[];
};

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
.cover-grid { flex: 1 1 auto; min-height: 0; display: grid; grid-template-columns: 1.5fr 1fr; gap: 22px; }
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
.report { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 18px 40px; columns: 2; column-gap: 40px; }
.report h3 { font-size: 17px; margin: 0 0 6px; break-after: avoid; color: #1e1b4b; }
.report ul { margin: 0 0 16px; padding-inline-start: 18px; }
.report li { font-size: 12px; line-height: 1.5; margin-bottom: 3px; break-inside: avoid; }
table.data { table-layout: auto; margin: 0 0 4px; }
table.data th, table.data td { width: auto; padding: 4px 8px; font-size: 11.5px; font-variant-numeric: tabular-nums; }
table.data th:not(:last-child), table.data td:not(:last-child) { white-space: nowrap; }
table.data tfoot td { font-weight: 700; background: #f5f3ff; }
.data-block { break-inside: avoid; margin-bottom: 12px; }
.data-block h3 { font-size: 13px; margin: 0 0 4px; color: #1e1b4b; }
.data-block .data-note { font-size: 10.5px; color: #57534e; margin: 0 0 4px; }
.cover-copy .data-block h3 { font-size: 12.5px; }
.plan-layout { height: 100%; display: grid; grid-template-columns: 34% 1fr; gap: 14px; align-items: center; padding: 6px 18px; }
.plan-key { align-self: start; margin-top: 26px; }
.plan-key h3 { font-size: 21px; margin: 0 0 12px; color: #1e1b4b; }
.plan-key table { width: 100%; table-layout: auto; border-collapse: collapse; }
.plan-key th, .plan-key td { font-size: 16px; padding: 9px 8px; text-align: right; border-bottom: 1px solid #e7e5e4; width: auto; }
.plan-key th { background: #f5f3ff; color: #1e1b4b; }
.plan-key td.n { font-weight: 700; color: #1e1b4b; text-align: center; }
.plan-key p { font-size: 13px; color: #57534e; margin: 12px 0 0; }
.plan-pic { height: 100%; min-height: 0; display: flex; align-items: center; justify-content: center; }
.plan-pic svg { max-height: 100%; }
.opener-tables { margin-top: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
.opener-tables .data-block { margin-bottom: 0; }
.compare.stack { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; gap: 6px; }
.data-page { flex: 1 1 auto; min-height: 0; overflow: hidden; padding: 16px 32px; columns: 3; column-gap: 28px; }
.brief p { font-size: 11.5px; line-height: 1.5; margin: 0 0 6px; color: #44403c; }
svg.labelled { width: 100%; height: 100%; display: block; }
svg.labelled text { font-family: "NotoHebrew", sans-serif; font-weight: 700; fill: #1e1b4b; paint-order: stroke; stroke: rgba(255,255,255,0.92); stroke-linejoin: round; }
`;

/** A table of the booklet's data, its title over it. */
function dataTable(t: BookletTable): string {
  const row = (cells: string[], tag: "td" | "th") => `<tr>${cells.map((c) => `<${tag}>${c}</${tag}>`).join("")}</tr>`;
  return `<div class="data-block"><h3>${escapeHtml(t.title)}</h3>${t.note ? `<p class="data-note">${escapeHtml(t.note)}</p>` : ""}<table class="data"><thead>${row(t.head.map(escapeHtml), "th")}</thead><tbody>${t.rows.map((r) => row(r, "td")).join("")}</tbody>${t.foot ? `<tfoot>${row(t.foot, "td")}</tfoot>` : ""}</table></div>`;
}

/** A plan with its rooms numbered, its key beside it, a north arrow and a scale bar over it. */
function keyedPlan(img: BookletImage, alt: string, key: PlanKey): string {
  const [w, h] = [img.width!, img.height!];
  // The frame without the plain margin the render keeps round the plot: the plan fills more of the page.
  const view = { x: Math.round(w * 0.06), y: Math.round(h * 0.075), w: Math.round(w * 0.88), h: Math.round(h * 0.925) };
  const r = Math.round(w / 78);
  const marks = key.markers
    .map((m) => `<g><circle cx="${(m.fx * w).toFixed(1)}" cy="${(m.fy * h).toFixed(1)}" r="${r}" fill="#ffffff" fill-opacity="0.94" stroke="#1e1b4b" stroke-width="${Math.max(2, Math.round(r / 7))}"/><text x="${(m.fx * w).toFixed(1)}" y="${(m.fy * h + r * 0.36).toFixed(1)}" text-anchor="middle" font-size="${Math.round(r * 1.05)}" fill="#1e1b4b" stroke="none">${m.n}</text></g>`)
    .join("");
  const bar = key.scale.fraction * w;
  const [bx, by] = [view.x + Math.round(view.w * 0.04), view.y + Math.round(view.h * 0.955)];
  const n = Math.hypot(key.north.x, key.north.z) || 1;
  const [nx, nz] = [key.north.x / n, key.north.z / n];
  const [ax, ay] = [view.x + Math.round(view.w * 0.07), view.y + Math.round(view.h * 0.08)];
  const len = Math.round(view.h * 0.05);
  const [tx, ty] = [ax + nx * len, ay + nz * len];
  const [px, py] = [-nz, nx];
  const head = `${tx},${ty} ${tx - nx * len * 0.35 + px * len * 0.2},${ty - nz * len * 0.35 + py * len * 0.2} ${tx - nx * len * 0.35 - px * len * 0.2},${ty - nz * len * 0.35 - py * len * 0.2}`;
  const stroke = Math.max(4, Math.round(w / 600));
  const furniture = `<g stroke="#1e1b4b" fill="#1e1b4b" stroke-width="${stroke}">
    <line x1="${ax}" y1="${ay}" x2="${tx}" y2="${ty}"/><polygon points="${head}"/>
    <text x="${tx + nx * len * 0.5}" y="${ty + nz * len * 0.5 + (nz > 0.5 ? len * 0.35 : 0)}" text-anchor="middle" font-size="${Math.round(w / 55)}" stroke="none" fill="#1e1b4b">צפון</text>
    <rect x="${bx}" y="${by - Math.round(h / 120)}" width="${bar.toFixed(1)}" height="${Math.round(h / 120)}"/>
    <text x="${(bx + bar / 2).toFixed(1)}" y="${by - Math.round(h / 80)}" text-anchor="middle" font-size="${Math.round(w / 60)}" stroke="none" fill="#1e1b4b">${key.scale.metres} מ'</text>
  </g>`;
  const rows = key.rows.map((r) => `<tr><td class="n">${r.n}</td><td>${escapeHtml(r.name)}</td><td dir="ltr">${escapeHtml(r.dims)}</td><td dir="ltr">${escapeHtml(r.area)}</td></tr>`).join("");
  return `<div class="master-stage"><div class="plan-layout">
    <aside class="plan-key"><h3>מקרא החללים</h3><table><thead><tr><th>#</th><th>חלל</th><th>מידות (מ')</th><th>שטח (מ"ר)</th></tr></thead><tbody>${rows}</tbody></table><p>המספר זהה בשני הבתים, תמונת הראי זה של זה.</p></aside>
    <div class="plan-pic"><svg class="labelled" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(alt)}"><image href="${src(img)}" width="${w}" height="${h}"/>${marks}${furniture}</svg></div>
  </div></div>`;
}

/** A picture with words written over it where the sheet writes them, scaled with it as one. */
function labelledImage(img: BookletImage, alt: string, labels: NonNullable<BuildingBookletSheet["labels"]>): string {
  const [w, h] = [img.width!, img.height!];
  const size = Math.round(w / 90);
  const text = labels
    .map((l) => {
      const [x, y] = [l.fx * w, l.fy * h];
      return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="middle" direction="rtl" font-size="${size}" stroke-width="${Math.round(size / 3.5)}">${l.lines
        .map((line, i) => `<tspan x="${x.toFixed(1)}" dy="${i ? Math.round(size * 1.15) : 0}"${i ? ` font-size="${Math.round(size * 0.85)}"` : ""}>${line}</tspan>`)
        .join("")}</text>`;
    })
    .join("");
  return `<svg class="labelled" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${escapeHtml(alt)}"><image href="${src(img)}" width="${w}" height="${h}"/>${text}</svg>`;
}

function fonts(): string {
  const { regular, bold } = loadPdfFontBuffers();
  return `
@font-face { font-family: "NotoHebrew"; font-weight: 400; src: url(data:font/ttf;base64,${regular.toString("base64")}) format("truetype"); }
@font-face { font-family: "NotoHebrew"; font-weight: 700; src: url(data:font/ttf;base64,${bold.toString("base64")}) format("truetype"); }`;
}

/** The pieces every page of the booklet is made of: its header, plaque, frame and the counter that numbers it. */
function pageKit(total: number, producedAt?: Date) {
  const logo = BSD_YBM_LOGO_PNG_BASE64
    ? `<img class="page-logo" src="data:image/png;base64,${BSD_YBM_LOGO_PNG_BASE64}" alt="BSD-YBM" />`
    : `<span class="gallery-wordmark">BSD-YBM</span>`;
  const pageLogo = link(logo);
  const at = producedAt ?? new Date();
  const dateHe = at.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const timeHe = at.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
  const produced = link(escapeHtml("הופק ע״י מערכת BSD-YBM"));
  let page = 1;
  const kicker = (text: string) => `${++page}/${total} · ${text}`;
  const top = (text: string) => `<header class="gallery-top">${pageLogo}<span class="gallery-kicker">${escapeHtml(text)}</span></header>`;
  const plaque = (label: string, value: string, caption?: string) => `<footer class="gallery-plaque">
    <div class="plaque-main"><div class="plaque-unit"><span class="plaque-label">${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div></div>
    ${caption ? `<p class="plaque-caption">${escapeHtml(caption)}</p>` : ""}
    <div class="plaque-produced">${produced}</div>
  </footer>`;
  const compact = `<footer class="gallery-plaque gallery-plaque-compact"><div class="plaque-produced">${produced}</div></footer>`;
  const framed = (img: BookletImage, alt: string, ornament = true, labels?: BuildingBookletSheet["labels"]) => `<div class="master-stage">
    <div class="ornament-frame${ornament ? "" : " ornament-frame-plain"}">
      ${ornament ? `<span class="corner corner-tl"></span><span class="corner corner-tr"></span><span class="corner corner-bl"></span><span class="corner corner-br"></span>` : ""}
      <div class="master-mat">${labels?.length && img.width && img.height ? labelledImage(img, alt, labels) : `<img src="${src(img)}" alt="${escapeHtml(alt)}" />`}</div>
    </div>
  </div>`;
  const renderPage = (s: BuildingBookletSheet, prefix: string) => `<section class="plate plate-master">
  ${top(kicker(`${prefix}גיליון ${s.no} · הדמיה`))}
  ${s.key && s.render.width && s.render.height ? keyedPlan(s.render, s.title, s.key) : framed(s.render, s.title, true, s.labels)}
  ${plaque(`${prefix}גיליון ${s.no} · ${s.title}`, "הדמיה", s.caption)}
</section>`;
  const sheetPage = (s: BuildingBookletSheet, prefix: string) => `<section class="plate plate-gallery">
  ${top(kicker(`${prefix}גיליון ${s.no} · תוכנית`))}
  ${framed(s.sheet, s.title, false)}
  ${plaque(`${prefix}גיליון ${s.no} · ${s.title}`, "הגיליון בחוברת ההגשה")}
</section>`;
  /** Two wide pictures (a facade, an elevation) are held one over the other, each the page's width; two squarer ones side by side. */
  const wide = (s: BuildingBookletSheet) => [s.render, s.sheet].every((i) => i.width && i.height && i.width / i.height > 1.35);
  const comparePage = (s: BuildingBookletSheet, prefix: string) => `<section class="plate plate-gallery plate-compare">
  ${top(kicker(`${prefix}גיליון ${s.no} · השוואה`))}
  <div class="master-stage"><div class="compare${wide(s) ? ' stack' : ''}">
    <figure><figcaption>הדמיה</figcaption><div class="compare-frame"><img src="${src(s.render)}" alt="הדמיה" /></div></figure>
    <figure><figcaption>הגיליון</figcaption><div class="compare-frame"><img src="${src(s.sheet)}" alt="הגיליון" /></div></figure>
  </div></div>
  ${compact}
</section>`;
  const platePage = (p: BuildingBookletPlate, prefix: string) => `<section class="plate plate-master">
  ${top(kicker(`${prefix}${p.kicker}`))}
  ${framed(p.image, p.title)}
  ${plaque(`${prefix}${p.kicker}`, p.title, p.caption)}
</section>`;
  const kpiRow = (kpis: Array<{ label: string; value: string }>) =>
    kpis.map((k) => `<div class="kpi"><span class="kpi-label">${escapeHtml(k.label)}</span><strong>${k.value}</strong></div>`).join("");
  const roomRows = (rooms: Array<{ name: string; floor: string; area: string }>) =>
    rooms.map((r) => `<tr><td>${escapeHtml(r.name)}</td><td>${r.floor}</td><td>${escapeHtml(r.area)}</td></tr>`).join("");
  const stamp = `${escapeHtml(dateHe)} ${escapeHtml(timeHe)}`;
  return { pageLogo, stamp, kicker, top, plaque, framed, renderPage, sheetPage, comparePage, platePage, kpiRow, roomRows };
}

/** A subtitle's parts, the empty ones left out — no dangling separator. */
const subtitleOf = (...parts: string[]) => parts.filter((p) => p.trim()).map(escapeHtml).join(" · ");

function documentHead(title: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="he"><head><meta charset="utf-8"/>
<title>${escapeHtml(`הדמיות — ${title}`)}</title>
<style>${fonts()}${BOOKLET_CSS}${LANDSCAPE_CSS}</style>
</head><body>`;
}

const NOTE = `<div class="note">ההדמיות להמחשה בלבד. המידות והשטחים לפי חוברת ההגשה. אין למדוד מהתמונה.</div>`;

export function buildBuildingBookletHtml(input: BuildingBookletInput): string {
  const total = input.sheets.length * 3 + input.plates.length + 1;
  const k = pageKit(total, input.producedAt);
  const sheetPages = input.sheets.map((s) => [k.renderPage(s, ""), k.sheetPage(s, ""), k.comparePage(s, "")].join("\n")).join("\n");
  const platePages = input.plates.map((p) => k.platePage(p, "")).join("\n");
  return `${documentHead(input.projectName)}
<section class="cover">
  <div class="cover-brand">${k.pageLogo}<span class="cover-kicker">1/${total} · שער</span></div>
  <div class="cover-grid">
    <div class="cover-photo"><img src="${src(input.hero)}" alt="${escapeHtml(input.projectName)}" /></div>
    <div class="cover-copy">
      <div class="hero">
        <div class="hero-top"><div class="sub">${link("BSD-YBM")} · חוברת הדמיה</div><div class="hero-meta">${k.stamp}</div></div>
        <h1>${escapeHtml(input.projectName)}</h1>
        <p class="sub">${subtitleOf(input.subtitle, input.architect)}</p>
        <div class="kpis">${k.kpiRow(input.kpis)}</div>
      </div>
      <h2 class="section-title">על הפרויקט</h2>
      <div class="narrative">${input.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>
      <div class="rooms-table-wrap">
        <h2 class="section-title">חללי המבנה</h2>
        <table><thead><tr><th>חלל</th><th>קומה</th><th>שטח</th></tr></thead><tbody>${k.roomRows(input.rooms)}</tbody></table>
      </div>
      ${NOTE}
      <div class="produced-bar" style="margin-top:12px">${link(`הופק על ידי מערכת BSD-YBM · ${k.stamp}`)}</div>
    </div>
  </div>
</section>
${sheetPages}
${platePages}
</body></html>`;
}

/** How many pages a chapter takes: its opening page, its data page, a render and a comparison a sheet, a page a plate. */
/** A model's storey tables stand on its opening page, beside the picture; the rest of its tables have a page of their own. */
const storeyTable = (t: BookletTable) => /^קומ/.test(t.title);
const chapterPages = (c: ProjectBookletChapter) => 1 + ((c.tables ?? []).some((t) => !storeyTable(t)) ? 1 : 0) + c.sheets.length * 2 + c.plates.length;

/**
 * Several models in one booklet (ProjectBookletInput): one cover with the
 * models' contents, a chapter a model, and the review at the end.
 */
export function buildProjectBookletHtml(input: ProjectBookletInput): string {
  const reported = input.chapters.filter((c) => c.report.length);
  const total = 1 + input.chapters.reduce((n, c) => n + chapterPages(c), 0) + (reported.length ? 1 : 0);
  const k = pageKit(total, input.producedAt);
  let at = 2;
  const contents = input.chapters
    .map((c) => {
      const row = `<tr><td>${escapeHtml(c.name)}</td><td>${c.sheets.length} גיליונות · ${c.plates.length} מבטים</td><td>עמ' ${at}</td></tr>`;
      at += chapterPages(c);
      return row;
    })
    .join("");
  const chapters = input.chapters
    .map((c) => {
      const prefix = `${c.name} · `;
      const opener = `<section class="cover">
  <div class="cover-brand">${k.pageLogo}<span class="cover-kicker">${escapeHtml(k.kicker(c.name))}</span></div>
  <div class="cover-grid">
    <div class="cover-photo"><img src="${src(c.hero)}" alt="${escapeHtml(c.name)}" /></div>
    <div class="cover-copy">
      <div class="hero">
        <div class="hero-top"><div class="sub">${escapeHtml(input.projectName)}</div><div class="hero-meta">${k.stamp}</div></div>
        <h1>${escapeHtml(c.name)}</h1>
        <div class="kpis">${k.kpiRow(c.kpis)}</div>
      </div>
      ${c.paragraphs.length ? `<div class="narrative">${c.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>` : ""}
      ${(c.tables ?? []).filter(storeyTable).length ? `<div class="opener-tables">${(c.tables ?? []).filter(storeyTable).map(dataTable).join("")}</div>` : ""}
      ${c.rooms.length ? `<div class="rooms-table-wrap"><h2 class="section-title">הבתים</h2><table><thead><tr><th>בית</th><th>קומה</th><th>שטח</th></tr></thead><tbody>${k.roomRows(c.rooms)}</tbody></table></div>` : ""}
    </div>
  </div>
</section>`;
      const dataTables = (c.tables ?? []).filter((t) => !storeyTable(t));
      const data = dataTables.length
        ? `<section class="plate plate-gallery">
  ${k.top(k.kicker(`${prefix}נתונים`))}
  <div class="data-page">${dataTables.map(dataTable).join("")}</div>
  ${k.plaque(c.name, "נתונים", "המידות והשטחים כפי שנכתבו בתוויות החדרים בתוכניות האדריכל; המפלסים מהחזיתות.")}
</section>`
        : "";
      const sheets = c.sheets.map((s) => `${k.renderPage(s, prefix)}\n${k.comparePage(s, prefix)}`).join("\n");
      const plates = c.plates.map((p) => k.platePage(p, prefix)).join("\n");
      return [opener, data, sheets, plates].filter(Boolean).join("\n");
    })
    .join("\n");
  const report = reported.length
    ? `<section class="plate plate-gallery">
  ${k.top(k.kicker("נספח · בקרת התאמה"))}
  <div class="report">${reported.map((c) => `<h3>${escapeHtml(c.name)}</h3><ul>${c.report.map((r) => `<li>${r}</li>`).join("")}</ul>`).join("")}</div>
  ${k.plaque("נספח", "בקרת התאמה", "כל גיליון הושווה להדמיה המדודה שלו; אלה ההבדלים שהבדיקה דיווחה, לעיון האדריכל.")}
</section>`
    : "";
  return `${documentHead(input.projectName)}
<section class="cover">
  <div class="cover-brand">${k.pageLogo}<span class="cover-kicker">1/${total} · שער</span></div>
  <div class="cover-grid">
    <div class="cover-photo"><img src="${src(input.hero)}" alt="${escapeHtml(input.projectName)}" /></div>
    <div class="cover-copy">
      <div class="hero">
        <div class="hero-top"><div class="sub">${link("BSD-YBM")} · חוברת הדמיה</div><div class="hero-meta">${k.stamp}</div></div>
        <h1>${escapeHtml(input.projectName)}</h1>
        <p class="sub">${subtitleOf(input.subtitle)}</p>
        <div class="kpis">${k.kpiRow(input.kpis)}</div>
      </div>
      ${
        input.tables
          ? `<div class="brief" style="margin-top:12px">${input.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>${input.tables.map(dataTable).join("")}`
          : `<h2 class="section-title">על הפרויקט</h2>
      <div class="narrative">${input.paragraphs.map((p) => `<p>${p}</p>`).join("")}</div>`
      }
      <div class="rooms-table-wrap">
        <h2 class="section-title">הדגמים בחוברת</h2>
        <table><thead><tr><th>דגם</th><th>בחוברת</th><th>עמוד</th></tr></thead><tbody>${contents}</tbody></table>
      </div>
      ${NOTE}
      <div class="produced-bar" style="margin-top:12px">${link(`הופק על ידי מערכת BSD-YBM · ${k.stamp}`)}</div>
    </div>
  </div>
</section>
${chapters}
${report}
</body></html>`;
}
