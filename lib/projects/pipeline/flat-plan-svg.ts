/**
 * The measured plan of a flat, drawn from its scene: walls, openings and their
 * swings, each space's number, name, area and size, the overall dimensions, a
 * legend and a scale bar. Numbers only on the plan, units in the legend: in an
 * SVG shown as an image Chromium mixes the order of Hebrew and numbers.
 */
import { areaOf, centreOf, dimsOf, f1, sizeRect, type FlatSpace, type SpaceRect } from "@/lib/projects/pipeline/flat-spaces";
import type { FlatScene } from "@/lib/projects/scene3d/types";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function measuredPlanSvg(scene: FlatScene, spaces: FlatSpace[]): { svg: string; width: number; height: number } {
  const PX = 110;
  const e = scene.extent;
  const margin = 2.2;
  const legendW = 4.2;
  const w = Math.round((e.width + margin * 2 + legendW) * PX);
  const h = Math.round((e.depth + margin * 2) * PX);
  const X = (x: number) => (x - e.x + margin + legendW) * PX;
  const Z = (z: number) => (z - e.z + margin) * PX;
  const box = (x: number, z: number, sx: number, sz: number) => ({ x: X(x - sx / 2), y: Z(z - sz / 2), w: sx * PX, h: sz * PX });
  const r1 = (n: number) => n.toFixed(1);
  const parts: string[] = [];
  const rect = (r: SpaceRect, attrs: string) => `<rect x="${r1(X(r.x))}" y="${r1(Z(r.z))}" width="${r1(r.w * PX)}" height="${r1(r.d * PX)}" ${attrs}/>`;
  for (const s of spaces) for (const r of s.rects) parts.push(rect(r, s.outside ? `fill="url(#deck)"` : `fill="${s.wet ? "#eef1f3" : "#faf6ef"}"`));
  for (const m of scene.meshes) {
    if (m.kind === "wall" && m.centre.y - m.size.y / 2 < 0.3) {
      const b = box(m.centre.x, m.centre.z, m.size.x, m.size.z);
      parts.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" fill="#24211f"/>`);
    }
    if (m.kind === "railing" && !m.sourceId.endsWith("/cap")) {
      const b = box(m.centre.x, m.centre.z, Math.max(m.size.x, 0.05), Math.max(m.size.z, 0.05));
      parts.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" fill="none" stroke="#5b6b78" stroke-width="2"/>`);
    }
  }
  for (const o of scene.openings) {
    const b = box(o.centre.x, o.centre.z, o.size.x, o.size.z);
    const along = o.size.x >= o.size.z;
    if (o.kind === "door") {
      const len = (along ? o.size.x : o.size.z) * PX;
      const [hx, hy] = along ? [b.x, b.y + b.h / 2] : [b.x + b.w / 2, b.y];
      const [lx, ly] = along ? [hx, hy - len] : [hx + len, hy];
      const [ex, ey] = along ? [hx + len, hy] : [hx, hy + len];
      parts.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" fill="#fff"/>`);
      parts.push(`<line x1="${r1(hx)}" y1="${r1(hy)}" x2="${r1(lx)}" y2="${r1(ly)}" stroke="#24211f" stroke-width="3"/>`);
      parts.push(`<path d="M${r1(lx)},${r1(ly)} A${r1(len)},${r1(len)} 0 0 1 ${r1(ex)},${r1(ey)}" fill="none" stroke="#24211f" stroke-width="1.5" stroke-dasharray="6 5"/>`);
    } else {
      parts.push(`<rect x="${r1(b.x)}" y="${r1(b.y)}" width="${r1(b.w)}" height="${r1(b.h)}" fill="#fff" stroke="#24211f" stroke-width="1.5"/>`);
      parts.push(
        along
          ? `<line x1="${r1(b.x)}" y1="${r1(b.y + b.h / 2)}" x2="${r1(b.x + b.w)}" y2="${r1(b.y + b.h / 2)}" stroke="#3b82c4" stroke-width="3"/>`
          : `<line x1="${r1(b.x + b.w / 2)}" y1="${r1(b.y)}" x2="${r1(b.x + b.w / 2)}" y2="${r1(b.y + b.h)}" stroke="#3b82c4" stroke-width="3"/>`,
      );
    }
  }
  const nameSize = (s: FlatSpace) => Math.max(14, Math.min(26, (sizeRect(s).w * PX - 12) / (Math.max(1, s.name.length) * 0.56)));
  spaces.forEach((s, i) => {
    const c = centreOf(s);
    const x = r1(X(c.x));
    const y = Z(c.z);
    parts.push(`<g font-family="Arial, sans-serif" text-anchor="middle">
<circle cx="${x}" cy="${r1(y - 52)}" r="17" fill="#1e1b4b"/><text x="${x}" y="${r1(y - 46)}" font-size="18" font-weight="700" fill="#fff">${i + 1}</text>
<text x="${x}" y="${r1(y - 12)}" font-size="${r1(nameSize(s))}" font-weight="700" fill="#1e1b4b">${esc(s.name)}</text>
<text x="${x}" y="${r1(y + 18)}" font-size="21" fill="#3f3a36">${f1(areaOf(s.rects))}</text>
<text x="${x}" y="${r1(y + 44)}" font-size="19" fill="#6b625b">${dimsOf(s)}</text></g>`);
  });
  const dim = (x1: number, y1: number, x2: number, y2: number, label: string, vertical: boolean) => {
    const tx = (x1 + x2) / 2;
    const ty = (y1 + y2) / 2;
    const tick = (x: number, y: number) => `<line x1="${x - (vertical ? 12 : 0)}" y1="${y - (vertical ? 0 : 12)}" x2="${x + (vertical ? 12 : 0)}" y2="${y + (vertical ? 0 : 12)}" stroke="#6d28d9" stroke-width="2"/>`;
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#6d28d9" stroke-width="2"/>${tick(x1, y1)}${tick(x2, y2)}
<text x="${tx}" y="${ty - (vertical ? 0 : 12)}" font-family="Arial, sans-serif" font-size="24" font-weight="700" fill="#6d28d9" text-anchor="middle"${vertical ? ` transform="rotate(-90 ${tx - 14} ${ty})"` : ""}>${label}</text>`;
  };
  parts.push(dim(X(e.x), Z(e.z) - 70, X(e.x + e.width), Z(e.z) - 70, f1(e.width), false));
  parts.push(dim(X(e.x + e.width) + 70, Z(e.z), X(e.x + e.width) + 70, Z(e.z + e.depth), f1(e.depth), true));
  const lx = 40;
  let ly = 80;
  const legend: string[] = [`<text x="${lx + 300}" y="${ly}" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="#1e1b4b" text-anchor="end">מקרא</text>`];
  const item = (swatch: string, label: string) => {
    ly += 56;
    legend.push(`<g transform="translate(${lx + 250},${ly - 26})">${swatch}</g><text x="${lx + 236}" y="${ly}" font-family="Arial, sans-serif" font-size="22" fill="#3f3a36" text-anchor="end">${label}</text>`);
  };
  item(`<rect width="50" height="30" fill="#24211f"/>`, "קיר");
  item(`<rect width="50" height="30" fill="#fff" stroke="#24211f" stroke-width="1.5"/><line x1="0" y1="15" x2="50" y2="15" stroke="#3b82c4" stroke-width="3"/>`, "חלון / דלת הזזה");
  item(`<line x1="0" y1="30" x2="0" y2="0" stroke="#24211f" stroke-width="3"/><path d="M0,0 A30,30 0 0 1 30,30" fill="none" stroke="#24211f" stroke-width="1.5" stroke-dasharray="6 5"/>`, "דלת וכיוון הפתיחה");
  item(`<rect width="50" height="30" fill="#faf6ef" stroke="#cfc6b8"/>`, "חדר");
  item(`<rect width="50" height="30" fill="#eef1f3" stroke="#cfc6b8"/>`, "חדר רטוב");
  item(`<rect width="50" height="30" fill="url(#deck)" stroke="#5b6b78" stroke-width="2"/>`, "מרפסת ומעקה");
  item(`<line x1="0" y1="15" x2="50" y2="15" stroke="#6d28d9" stroke-width="2"/>`, "מידה כוללת");
  ly += 90;
  legend.push(`<g font-family="Arial, sans-serif" font-size="20" fill="#3f3a36">${[0, 1, 2, 3, 4].map((k) => `<rect x="${lx + 20 + k * PX}" y="${ly}" width="${PX}" height="14" fill="${k % 2 ? "#fff" : "#24211f"}" stroke="#24211f"/>`).join("")}
<text x="${lx + 20}" y="${ly + 40}" text-anchor="middle">0</text><text x="${lx + 20 + 5 * PX}" y="${ly + 40}" text-anchor="middle">5</text></g>
<text x="${lx + 300}" y="${ly - 16}" font-family="Arial, sans-serif" font-size="20" fill="#3f3a36" text-anchor="end">קנה מידה, במטרים</text>`);
  ly += 110;
  legend.push(`<g font-family="Arial, sans-serif" fill="#6b625b" text-anchor="end"><text x="${lx + 300}" y="${ly}" font-size="18">בכל חלל: מספר, שם, שטח במ״ר</text><text x="${lx + 300}" y="${ly + 26}" font-size="18">ומידות במטרים</text></g>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<defs><pattern id="deck" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="14" height="14" fill="#eef0ea"/><line x1="0" y1="0" x2="0" y2="14" stroke="#c9cfc2" stroke-width="3"/></pattern></defs>
<rect width="${w}" height="${h}" fill="#fff"/>${parts.join("\n")}${legend.join("\n")}</svg>`;
  return { svg, width: w, height: h };
}
