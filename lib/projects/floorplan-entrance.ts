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
  /** Normalised to the still: 0 is the left/top edge, 1 the right/bottom. */
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
{ "found": true, "x": 0.0, "y": 0.0, "facing": "left", "confidence": 0.0 }

- x and y locate the front door in the STILL, as fractions of its width and
  height: x 0 is the left edge, 1 the right edge; y 0 is the top, 1 the bottom.
  Put the point ON the doorway in the outer wall, not in the middle of the hall
  behind it.
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
      const x = clamp01(raw.x);
      const y = clamp01(raw.y);
      const confidence = clamp01(raw.confidence) ?? 0;
      // A marker in the wrong place is worse than no marker: it tells a buyer
      // the door is somewhere it is not.
      if (x == null || y == null || confidence < 0.5) return null;
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
    const size = Math.max(12, Math.round(Math.min(width, height) * 0.026));
    const cx = point.x * width;
    const cy = point.y * height;
    const points = entranceTrianglePoints(cx, cy, size, point.facing);

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
