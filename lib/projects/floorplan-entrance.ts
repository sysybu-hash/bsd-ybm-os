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
  /** The middle of the door opening, normalised: 0 is the left/top edge, 1 the right/bottom. */
  x: number;
  y: number;
  /** Which way someone walks when they come through the door. */
  facing: "left" | "right" | "up" | "down";
};

const LOCATE_INSTRUCTION = `
You are looking at a 3D top-down still of an Israeli apartment and the sales
plan it was generated from.

The plan marks the apartment's front door with a small solid black triangle on
an outer wall. Find where that same front door is IN THE STILL.

Return JSON only:
{ "found": true, "x1": 0.0, "y1": 0.0, "x2": 0.0, "y2": 0.0, "facing": "left", "confidence": 0.0 }

- The front door is a GAP in the outer wall: the wall stops, the opening runs,
  the wall starts again. Give the two ENDS of that gap — where the wall stops
  and where it starts again — as (x1,y1) and (x2,y2), fractions of the still's
  width and height: x 0 is the left edge, 1 the right edge; y 0 is the top, 1
  the bottom. Both points sit on the wall line, not inside the hall behind it.
- Be precise about the ends. The door's position is taken as the midpoint of
  the two, and a point from the edge of the gap puts it against the wall.
- facing is the direction a person moves as they step through the door into the
  apartment: "right" if they walk to the right, "left", "up" or "down".
- confidence 0 to 1. Return "found": false if the still does not show the
  entrance, if the apartment outline is too different from the plan to match
  them up, or if you would be guessing.
- Judge from the geometry: the entrance is on an outer wall, opens into a hall
  or the living space, and matches the side of the plan the black triangle is
  drawn on.
`.trim();

function clamp01(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return n;
}

export async function locateApartmentEntrance(
  still: { base64: string; mimeType: string },
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
              { inlineData: { data: still.base64, mimeType: still.mimeType } },
              { inlineData: { data: plan.base64, mimeType: plan.mimeType } },
            ],
          },
        ],
        generationConfig: deterministicGenerationConfig({ responseMimeType: "application/json" }),
      });
      const raw = parseModelJsonText(result.response.text());
      if (raw.found !== true) return null;
      const x1 = clamp01(raw.x1);
      const y1 = clamp01(raw.y1);
      const x2 = clamp01(raw.x2);
      const y2 = clamp01(raw.y2);
      const confidence = clamp01(raw.confidence) ?? 0;
      // A marker in the wrong place is worse than no marker: it tells a buyer
      // the door is somewhere it is not.
      if (x1 == null || y1 == null || x2 == null || y2 == null || confidence < 0.5) return null;
      const x = (x1 + x2) / 2;
      const y = (y1 + y2) / 2;
      const facing = raw.facing;
      if (facing !== "left" && facing !== "right" && facing !== "up" && facing !== "down") {
        return null;
      }
      return { x, y, facing };
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

/** The way someone walks in, given the direction that leads out. */
export function facingFromOutward(dx: number, dy: number): EntrancePoint["facing"] {
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

/** The triangle's three corners, pointing the way someone walks in. */
export function entranceTrianglePoints(
  cx: number,
  cy: number,
  size: number,
  facing: EntrancePoint["facing"],
): string {
  const h = size / 2;
  const pts: Record<EntrancePoint["facing"], Array<[number, number]>> = {
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
    // Directly opposite the opening, on the page, pointing back at it.
    const door = { x: point.x * width, y: point.y * height };
    const outside = nearestOutside(data, info.width, info.height, door, size);
    const facing = outside ? facingFromOutward(outside.dx, outside.dy) : point.facing;
    // The triangle is a marker width across, so a little over one width out
    // puts the whole of it on the page with its leading corner nearly touching
    // the outline: at the door, not in it and not away from it.
    const standOff = size * 0.95;
    const centre = outside
      ? {
          x: Math.round(outside.x + outside.dx * standOff),
          y: Math.round(outside.y + outside.dy * standOff),
        }
      : { x: Math.round(door.x), y: Math.round(door.y) };
    const points = entranceTrianglePoints(centre.x, centre.y, size, facing);

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
