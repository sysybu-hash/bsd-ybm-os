import { GoogleGenerativeAI } from "@google/generative-ai";
import sharp from "sharp";

import { parseModelJsonText } from "@/lib/ai-document-json";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  deterministicGenerationConfig,
  getFloorplanLayoutModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";

const log = createLogger("floorplan-entrance");

/**
 * The entrance marker every sales sheet carries, put back after the render.
 *
 * The sheet draws a small filled triangle at the front door and a buyer reads
 * the plan from it. Every prompt lock forbids CAD annotation in the still and
 * the audit fails a frame that has any — a rule worth keeping, because when the
 * model is allowed drawing marks it also copies north arrows, dimension ticks
 * and hatch onto the floor. So the model is never asked to draw this one. A
 * vision pass says where the front door ended up in the finished frame, and the
 * triangle is composited here, at a known size, in the right colour, every time.
 */

export type EntrancePoint = {
  /**
   * Where the sheet's own triangle sits, as a fraction of the APARTMENT's
   * bounding box on the sheet — not of the sheet. 0 is its left/top edge, 1 its
   * right/bottom. Slightly outside that range is normal and expected: the
   * triangle is drawn beyond the outline.
   */
  x: number;
  y: number;
};

const LOCATE_INSTRUCTION = `
You are looking at an Israeli apartment sales plan.

Somewhere on it, on the paper just outside the apartment's outline, is a small
SOLID BLACK TRIANGLE marking the front door and pointing at it. Find it.

Ignore the still if one is attached. This question is only about the plan.

Return JSON only:
{ "found": true, "x": 0.0, "y": 0.0, "confidence": 0.0 }

- First find the APARTMENT'S BOUNDING BOX on the sheet: the smallest rectangle
  containing the flat itself. Not the page, not the dimension chains, not the
  title block — the walls of the apartment and nothing else.
- x and y then locate the triangle INSIDE THAT BOX, as fractions of its width
  and height. x 0 is the box's left edge, 1 its right edge; y 0 is its top, 1
  its bottom. The middle of the box is 0.5, 0.5.
- The triangle sits outside the outline, so a value a little below 0 or above 1
  is right and expected — e.g. a door on the left wall two thirds of the way
  down is about x -0.03, y 0.66. Do not clamp to the box.
- confidence 0 to 1. Return "found": false if there is no such triangle on the
  sheet, or if you would be guessing which mark it is. A north arrow, a section
  arrow or a dimension tick is not it: the entrance triangle is small, solid
  black, and sits against the outline of the flat.
`.trim();

/** A fraction of the apartment's box, which a mark outside it can overshoot. */
function asRelative(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < -0.5 || n > 1.5) return null;
  return n;
}

function clamp01(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

export async function locateApartmentEntrance(
  plan: { base64: string; mimeType: string },
): Promise<EntrancePoint | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);

  for (const modelId of getFloorplanLayoutModelChain()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [
              { text: LOCATE_INSTRUCTION },
              { inlineData: { data: plan.base64, mimeType: plan.mimeType } },
            ],
          },
        ],
        generationConfig: deterministicGenerationConfig({ responseMimeType: "application/json" }),
      });
      const raw = parseModelJsonText(result.response.text());
      if (raw.found !== true) return null;
      // Outside the box is the normal answer, so this range is generous — it is
      // only here to reject a garbled number.
      const x = asRelative(raw.x);
      const y = asRelative(raw.y);
      const confidence = clamp01(raw.confidence) ?? 0;
      // A marker in the wrong place is worse than no marker: it tells a buyer
      // the door is somewhere it is not.
      if (x == null || y == null || confidence < 0.5) return null;
      return { x, y };
    } catch (err: unknown) {
      if (isLikelyGeminiModelUnavailable(err)) continue;
      log.warn("entrance lookup failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  return null;
}

/** Which way the triangle points. */
export type EntranceFacing = "left" | "right" | "up" | "down";

/** The way someone walks in, given the direction that leads out. */
export function facingFromOutward(dx: number, dy: number): EntranceFacing {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "left" : "right";
  return dy > 0 ? "up" : "down";
}

/**
 * The page, found by flooding in from the frame's border.
 *
 * Every earlier version asked "is this patch light and flat?", and a pale
 * cream wall or a bright threshold answers yes. Outside is not a colour, it is
 * a place: the region joined to the edge of the frame without crossing the
 * apartment. Flooding from the border settles it, and no wall inside the flat
 * can be mistaken for it however pale it renders.
 */
export function pageMaskFromBorder(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
): Uint8Array {
  const PAGE_MIN = 224;
  const mask = new Uint8Array(width * height);
  const queue: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = y * width + x;
    if (mask[i]) return;
    if ((data[i] ?? 0) < PAGE_MIN) return;
    mask[i] = 1;
    queue.push(i);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (queue.length > 0) {
    const i = queue.pop()!;
    const x = i % width;
    const y = (i - x) / width;
    push(x - 1, y);
    push(x + 1, y);
    push(x, y - 1);
    push(x, y + 1);
  }
  return mask;
}

/**
 * The nearest point outside the flat to the front door.
 *
 * Six attempts at this marker went wrong the same way: something other than
 * "the closest bit of empty page to the door" decided where it went — the
 * model's own guess at an outside point, or a search that only accepted page
 * deep enough to prove itself, which by construction is not the nearest.
 *
 * This returns the first background pixel found sweeping outward from the door,
 * so the marker lands directly opposite the opening. The direction it was found
 * in is confirmed against page three marker widths further out, so a pale wall
 * or a strip of terrace cannot pass — but the point returned is the near one,
 * not the far one.
 */
/** True where the page is open all round, not a thin strip joined to it. */
export function openPage(
  mask: Uint8Array,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (!mask[y * width + x]) return false;
    }
  }
  return true;
}

export function nearestOutside(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  door: { x: number; y: number },
  size: number,
  page?: Uint8Array,
): { x: number; y: number; dx: number; dy: number } | null {
  const mask = page ?? pageMaskFromBorder(data, width, height);
  const step = Math.max(1, Math.round(size * 0.08));
  // An outer wall touches the page along its whole length, so the flood runs
  // straight into anything pale on the building's edge. Open page has room
  // around it; a wall band does not.
  const clearance = Math.max(2, Math.round(size * 0.45));

  for (let reach = step; reach <= size * 12; reach += step) {
    for (let degrees = 0; degrees < 360; degrees += 3) {
      const radians = (degrees * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const x = Math.round(door.x + dx * reach);
      const y = Math.round(door.y + dy * reach);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (!openPage(mask, width, height, x, y, clearance)) continue;
      // Open page starts a clearance inside the page, so walk back toward the
      // door for the edge itself — that is what the marker stands against.
      let edgeX = x;
      let edgeY = y;
      for (let back = 1; back <= clearance * 2; back += 1) {
        const bx = Math.round(x - dx * back);
        const by = Math.round(y - dy * back);
        if (bx < 0 || by < 0 || bx >= width || by >= height) break;
        if (!mask[by * width + bx]) break;
        edgeX = bx;
        edgeY = by;
      }
      return { x: edgeX, y: edgeY, dx, dy };
    }
  }
  return null;
}

/** The rectangle the apartment occupies: everything the page flood did not reach. */
export function apartmentBounds(
  page: Uint8Array,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (page[y * width + x]) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0 || maxY < 0) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Slides a point off the apartment onto the page beside it.
 *
 * Sheets differ a little from renders, so the mapped position can land just
 * inside the flat. The marker belongs outside, so walk to the nearest page.
 */
export function nudgeOntoPage(
  page: Uint8Array,
  width: number,
  height: number,
  at: { x: number; y: number },
  size: number,
): { x: number; y: number } {
  const inside = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < width && y < height && page[y * width + x] === 1;
  if (inside(at.x, at.y)) return at;
  for (let reach = 1; reach <= size * 6; reach += 1) {
    for (let degrees = 0; degrees < 360; degrees += 6) {
      const radians = (degrees * Math.PI) / 180;
      const x = Math.round(at.x + Math.cos(radians) * reach);
      const y = Math.round(at.y + Math.sin(radians) * reach);
      if (inside(x, y)) return { x, y };
    }
  }
  return at;
}

/** The direction from a point on the page to the nearest bit of apartment. */
export function towardApartment(
  page: Uint8Array,
  width: number,
  height: number,
  at: { x: number; y: number },
  size: number,
): { dx: number; dy: number } | null {
  for (let reach = 1; reach <= size * 8; reach += 1) {
    for (let degrees = 0; degrees < 360; degrees += 4) {
      const radians = (degrees * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const x = Math.round(at.x + dx * reach);
      const y = Math.round(at.y + dy * reach);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (page[y * width + x]) continue;
      return { dx, dy };
    }
  }
  return null;
}

/** The triangle's three corners, pointing the way someone walks in. */
export function entranceTrianglePoints(
  cx: number,
  cy: number,
  size: number,
  facing: EntranceFacing,
): string {
  const h = size / 2;
  const pts: Record<EntranceFacing, Array<[number, number]>> = {
    right: [
      [cx + h, cy],
      [cx - h, cy - h],
      [cx - h, cy + h],
    ],
    left: [
      [cx - h, cy],
      [cx + h, cy - h],
      [cx + h, cy + h],
    ],
    down: [
      [cx, cy + h],
      [cx - h, cy - h],
      [cx + h, cy - h],
    ],
    up: [
      [cx, cy - h],
      [cx - h, cy + h],
      [cx + h, cy + h],
    ],
  };
  return pts[facing].map(([px, py]) => `${Math.round(px)},${Math.round(py)}`).join(" ");
}

/**
 * Composites the entrance triangle onto a finished still.
 *
 * Returns the original bytes when anything goes wrong. A missing marker costs
 * the buyer one convenience; failing the whole still would throw away a frame
 * that took real image-model calls to get right.
 */
export async function markApartmentEntrance(
  image: { base64: string; mimeType: string },
  point: EntrancePoint,
): Promise<{ base64: string; mimeType: string }> {
  try {
    const input = Buffer.from(image.base64, "base64");
    const meta = await sharp(input).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 200 || height < 200) return image;

    // Scaled off the frame so it reads the same on a 768px still and a 1400px
    // one, and small enough to sit in a doorway rather than cover it.
    const size = Math.max(14, Math.round(Math.min(width, height) * 0.032));
    const { data, info } = await sharp(input)
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const page = pageMaskFromBorder(data, info.width, info.height);
    const flat = apartmentBounds(page, info.width, info.height);
    if (!flat) return image;

    // The sheet's own triangle, put back in the same place on the render: the
    // same fraction across and down the apartment's bounding box. Asking where
    // a door is in a 3D frame never worked; where a triangle is on a drawing is
    // a question with one answer.
    const wanted = {
      x: Math.round(flat.x + point.x * flat.width),
      y: Math.round(flat.y + point.y * flat.height),
    };
    const centre = nudgeOntoPage(page, info.width, info.height, wanted, size);
    const inward = towardApartment(page, info.width, info.height, centre, size);
    const facing = inward ? facingFromOutward(-inward.dx, -inward.dy) : "right";
    // A door near the edge of the sheet puts the marker half off the frame.
    // Keep the whole triangle inside it.
    const margin = Math.ceil(size * 0.5) + 2;
    const placed = {
      x: Math.min(width - margin, Math.max(margin, centre.x)),
      y: Math.min(height - margin, Math.max(margin, centre.y)),
    };
    const points = entranceTrianglePoints(placed.x, placed.y, size, facing);

    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        // A pale halo first, so the mark reads on dark parquet and on pale tile
        // alike without a hard outline that looks like a sticker.
        `<polygon points="${points}" fill="none" stroke="#faf7f2" stroke-width="${Math.max(
          2,
          Math.round(size * 0.28),
        )}" stroke-linejoin="round" opacity="0.85"/>` +
        `<polygon points="${points}" fill="#1c1917"/>` +
        `</svg>`,
    );

    const out = await sharp(input)
      .composite([{ input: overlay, top: 0, left: 0 }])
      .jpeg({ quality: 92, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch (err: unknown) {
    log.warn("entrance marker failed, shipping the unmarked still", {
      error: err instanceof Error ? err.message : String(err),
    });
    return image;
  }
}
