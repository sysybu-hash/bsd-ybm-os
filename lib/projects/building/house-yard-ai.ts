import sharp from "sharp";

import { insidePolygon } from "@/lib/projects/building/assemble";
import { askDrawing } from "@/lib/projects/building/house-ai";
import type { YardHint, YardRegion } from "@/lib/projects/building/house-yard";
import { DWF_FLOOR_UNITS_PER_METRE } from "@/lib/projects/dwf-building";
import type { DwfGeometry } from "@/lib/projects/floorplan-dwf";
import { dwfSheetJpeg } from "@/lib/projects/floorplan-render-dwf";

/**
 * The plot's unnamed parts, named by the vision model and held to the ink.
 *
 * The ground floor sheet names the lawn by its dotted pen and the pavers by
 * their herringbone; what is left it does not name, and the yard is paved
 * there. The model is shown those parts, numbered, and says what each is. A
 * lawn or a bed is laid only where the sheet's own ink inside the part is a
 * garden's — texture of short strokes or drawn shrubs, no herringbone, no
 * treads — and nowhere else; steps and paving are reported and stay paved.
 */
export type YardKind = "lawn" | "planting" | "paving" | "steps" | "gravel" | "other";
const KINDS: YardKind[] = ["lawn", "planting", "paving", "steps", "gravel", "other"];

/** The ink inside a part of the plot, per m²; its treads; how thick it is across, metres. */
export type YardTexture = { areaM2: number; dots: number; herringbone: number; shrubs: number; treads: number; thickM: number };

export type YardVerdict = { id: number; kind: YardKind; areaM2: number; laid: boolean; why: string };

export function yardTexture(sheet: DwfGeometry, region: YardRegion, upm = DWF_FLOOR_UNITS_PER_METRE): YardTexture {
  const { x0, y0, x1, y1 } = region.box;
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && insidePolygon(region.ring, x, y);
  let dots = 0;
  let herringbone = 0;
  const across: number[] = [];
  for (const s of sheet.segments) {
    const [mx, my] = [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
    if (!inside(mx, my)) continue;
    const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1) / upm;
    let a = Math.abs((Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180) / Math.PI) % 180;
    a = Math.min(a, 180 - a);
    if (len < 0.06) dots++;
    else if (len <= 0.8 && Math.abs(a - 45) < 8) herringbone++;
    // A tread runs most of the way across the part, square to the page.
    const w = (x1 - x0) / upm;
    const h = (y1 - y0) / upm;
    if (a < 3 && len >= 0.7 * w) across.push(Math.round(my));
    else if (a > 87 && len >= 0.7 * h) across.push(Math.round(mx) + 1e6);
  }
  const shrubs = [...sheet.curves, ...sheet.arcs.map((c) => ({ x1: c.cx, y1: c.cy, x2: c.cx, y2: c.cy }))].filter((c) => inside((c.x1 + c.x2) / 2, (c.y1 + c.y2) / 2)).length;
  const area = Math.max(0.1, region.areaM2);
  const long = Math.max(x1 - x0, y1 - y0) / upm;
  return { areaM2: region.areaM2, dots: dots / area, herringbone: herringbone / area, shrubs: shrubs / area, treads: new Set(across).size, thickM: area / Math.max(0.1, long) };
}

/** Whether the ink bears out what the model named a part. Only a lawn or a bed changes the yard. */
export function verifyYardKind(kind: YardKind, t: YardTexture): { laid: boolean; why: string } {
  if (kind !== "lawn" && kind !== "planting") {
    if (kind === "steps") return { laid: false, why: t.treads >= 3 ? `${t.treads} treads drawn; left paved` : "no treads drawn; left paved" };
    return { laid: false, why: "left paved, as the sheet leaves it" };
  }
  if (t.herringbone >= 2) return { laid: false, why: `herringbone drawn in it (${t.herringbone.toFixed(1)}/m²): pavers, not a ${kind}` };
  if (t.treads >= 3) return { laid: false, why: `${t.treads} treads drawn in it: steps, not a ${kind}` };
  // A strip along a fence or the street is a kerb or a path's edge, not a garden.
  if (t.thickM < 0.8) return { laid: false, why: `${t.thickM.toFixed(2)} m across: a strip, not a ${kind}` };
  if (t.dots >= 3 || t.shrubs >= 1.5) return { laid: true, why: `${t.dots.toFixed(1)} dots/m², ${t.shrubs.toFixed(1)} shrub strokes/m²` };
  return { laid: false, why: "no garden ink in it" };
}

const YARD_PROMPT = `This is the plot of a private house in Israel, from its ground floor plan (north up). The parts of the plot outlined in red and numbered are parts the drawing does not label.
For each numbered part say what it most likely is on the ground: "lawn", "planting" (a bed, shrubs or trees), "paving" (paths, terraces, driveway), "steps", "gravel", or "other".
Judge by the drawing's own hatching and symbols inside the part and by where it is (beside the house, at the gate, along the fence).
Answer JSON only: {"parts":[{"id":1,"kind":"paving","why":"short reason"}]}`;

/** The plot's unnamed parts, the model's name for each, and the ones laid as garden. */
export async function classifyYard(sheet: DwfGeometry, regions: YardRegion[], upm = DWF_FLOOR_UNITS_PER_METRE): Promise<{ hints: YardHint[]; verdicts: YardVerdict[]; image: Buffer } | null> {
  const shown = [...regions].sort((a, b) => b.areaM2 - a.areaM2).slice(0, 30);
  if (!shown.length) return null;
  const xs = shown.flatMap((r) => [r.box.x0, r.box.x1]);
  const ys = shown.flatMap((r) => [r.box.y0, r.box.y1]);
  const pad = 2 * upm;
  const box = { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, width: Math.max(...xs) - Math.min(...xs) + 2 * pad, height: Math.max(...ys) - Math.min(...ys) + 2 * pad };
  const px = 2400;
  const base = await dwfSheetJpeg(sheet, box, px);
  const k = px / box.width;
  const height = Math.round(box.height * k);
  const overlay = shown
    .map((r) => {
      const pts = r.ring.map(([x, y]) => `${((x - box.x) * k).toFixed(1)},${((y - box.y) * k).toFixed(1)}`).join(" ");
      const [cx, cy] = [((r.box.x0 + r.box.x1) / 2 - box.x) * k, ((r.box.y0 + r.box.y1) / 2 - box.y) * k];
      return `<polygon points="${pts}" fill="rgba(255,0,0,0.08)" stroke="#e00" stroke-width="3"/><text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="34" font-family="Arial" font-weight="bold" fill="#e00" text-anchor="middle" dominant-baseline="middle">${r.id}</text>`;
    })
    .join("");
  const image = await sharp(base)
    .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${height}">${overlay}</svg>`), top: 0, left: 0 }])
    .jpeg({ quality: 88 })
    .toBuffer();
  const answer = await askDrawing(YARD_PROMPT, [image]);
  if (!answer || !Array.isArray(answer.parts)) return null;
  const hints: YardHint[] = [];
  const verdicts: YardVerdict[] = [];
  for (const raw of answer.parts as Array<Record<string, unknown>>) {
    const region = shown.find((r) => r.id === Number(raw?.id));
    if (!region || !KINDS.includes(raw.kind as YardKind)) continue;
    const kind = raw.kind as YardKind;
    const v = verifyYardKind(kind, yardTexture(sheet, region, upm));
    verdicts.push({ id: region.id, kind, areaM2: region.areaM2, ...v });
    if (v.laid) hints.push({ ring: region.ring, kind: kind as "lawn" | "planting" });
  }
  return { hints, verdicts, image };
}
