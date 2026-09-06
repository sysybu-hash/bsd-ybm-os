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
- Be precise about the ends. A marker is drawn at the midpoint of what you
  return, and a point taken from the edge of the gap puts it against the wall
  instead of in front of the opening.
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

/** Which way is OUT of the apartment, given the way someone walks in. */
const OUTWARD: Record<EntrancePoint["facing"], [number, number]> = {
  right: [-1, 0],
  left: [1, 0],
  down: [0, -1],
  up: [0, 1],
};

/**
 * True where the frame is empty page rather than apartment.
 *
 * The still is a cutaway on a plain near-white ground, so "outside the flat" is
 * a patch that is both very light and flat. Luminance alone would call a pale
 * tiled terrace background; the variance check keeps grout lines and furniture
 * out of it.
 */
export function isBackgroundPatch(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  cx: number,
  cy: number,
  radius: number,
): boolean {
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = Math.max(0, cy - radius); y <= Math.min(height - 1, cy + radius); y++) {
    for (let x = Math.max(0, cx - radius); x <= Math.min(width - 1, cx + radius); x++) {
      const v = data[y * width + x] ?? 255;
      n += 1;
      sum += v;
      sumSq += v * v;
    }
  }
  if (n === 0) return false;
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  return mean > 232 && variance < 90;
}

/**
 * The nearest empty page to the door, in whatever direction that turns out to be.
 *
 * Three earlier attempts assumed the door sits on a straight wall and walked
 * one of four axes outward from it. דירה 15's entrance is a stepped notch: the
 * page is below the opening while the flat continues to the left, so an axis
 * walk landed the marker at the corner of the step instead of in front of the
 * doorway. Searching outward in every direction and taking the closest page
 * handles a straight wall and a notch the same way, with no assumption about
 * which is which.
 *
 * The page has to keep going two marker widths past the point that found it,
 * so a pale cream wall does not pass for it.
 */
export function nearestPage(
  data: Uint8Array | Buffer,
  width: number,
  height: number,
  door: { x: number; y: number },
  size: number,
): { x: number; y: number; dx: number; dy: number } | null {
  const radius = Math.max(2, Math.round(size * 0.45));
  const step = Math.max(2, Math.round(size * 0.25));
  const maxReach = Math.round(size * 12);

  for (let reach = step; reach <= maxReach; reach += step) {
    for (let degrees = 0; degrees < 360; degrees += 6) {
      const radians = (degrees * Math.PI) / 180;
      const dx = Math.cos(radians);
      const dy = Math.sin(radians);
      const x = Math.round(door.x + dx * reach);
      const y = Math.round(door.y + dy * reach);
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      if (!isBackgroundPatch(data, width, height, x, y, radius)) continue;
      // Page keeps going; a wall band does not. Two probes, because a single
      // one at a shallow angle can still land inside a band running the same
      // way as the search direction.
      const keepsGoing = [2, 4].every((multiple) =>
        isBackgroundPatch(
          data,
          width,
          height,
          Math.round(x + dx * size * multiple),
          Math.round(y + dy * size * multiple),
          radius,
        ),
      );
      if (!keepsGoing) continue;
      return { x, y, dx, dy };
    }
  }
  return null;
}

/** The way someone walks in, given the direction that leads out. */
export function facingFromOutward(dx: number, dy: number): EntrancePoint["facing"] {
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "left" : "right";
  return dy > 0 ? "up" : "down";
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
    const door = { x: point.x * width, y: point.y * height };
    const page = nearestPage(data, info.width, info.height, door, size);
    // No page anywhere near — a frame that fills its canvas. Fall back to the
    // model's own reading and nudge clear of the wall.
    const facing = page ? facingFromOutward(page.dx, page.dy) : point.facing;
    const clearance = size * 1.1;
    const centre = page
      ? { x: Math.round(page.x + page.dx * clearance), y: Math.round(page.y + page.dy * clearance) }
      : {
          x: Math.round(door.x + OUTWARD[point.facing][0] * clearance),
          y: Math.round(door.y + OUTWARD[point.facing][1] * clearance),
        };
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
