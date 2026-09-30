import type { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

import { recordAiUsage, usageFromGemini } from "@/lib/ai-usage";
import { getFloorplanVizModelChain } from "@/lib/gemini-model";

/**
 * A photographic finish over a measured render — and proof it changed nothing
 * but the surfaces.
 *
 * The render is the authority: every wall, window and chair in it was read
 * off the architect's sheets. The image model is asked to paint it, not to
 * draw it, and what comes back is laid over the render edge for edge. A
 * finish whose edges wander from the render's has moved the building, and is
 * not used.
 */
export type FinishKind = "exterior" | "interior" | "cutaway" | "elevation" | "section" | "photo";

export function finishPrompt(kind: FinishKind, subject: string): string {
  const keep = [
    "This image is an exact architectural render. Repaint it as a professional architectural photograph.",
    "KEEP EXACTLY: the camera position, lens and framing; every wall, opening, window, mullion, column, slab and roof edge in the same place and size; every piece of furniture, its position, size and count; the stair; the trees and cars where they are. There are NO people: do not add any person or human figure anywhere.",
    "Do NOT add, remove, move or resize any element. Do NOT add windows, doors, rooms, storeys, signs or furniture. Do NOT change the building's proportions.",
    "Do NOT add any sign, lettering, logo or text anywhere. Where the render has lettering, keep it where it is.",
    "Keep every retaining wall, terrace edge, ramp and the shape of the ground exactly; do not open up views that the render's walls close.",
  ];
  const look =
    kind === "exterior" || kind === "photo"
      ? "Luxury architectural visualization, the finest quality: warm honey-toned Jerusalem limestone with natural variation, crisp arrises and fine chisel texture; slim anthracite aluminium frames; deep reflective glazing mirroring the sky; the soft raking light of a clear golden-hour sky over the Judean hills, long gentle shadows; immaculate stone paving and asphalt; mature olive trees and manicured Mediterranean planting; premium cars. Perfect exposure, rich but natural colour, no haze, tack-sharp, photographed by a top architectural photographer on a tilt-shift lens."
      : kind === "elevation"
        ? "Luxury architectural visualization of a straight-on orthographic elevation — keep it perfectly flat-on, no perspective: warm honey-toned Jerusalem limestone with natural variation and fine texture, anthracite aluminium frames, reflective glazing, soft golden-hour light, clean sky, the ground as drawn. Presentation-board quality."
        : kind === "interior"
          ? "Luxury interior visualization, magazine quality: a refined contemporary Israeli public centre; warm matte walls, natural oak and fine stone or premium vinyl floors, a clean acoustic ceiling with flush LED panels glowing softly, warm daylight through the windows, premium upholstery with visible weave, subtle reflections, natural bounce light and soft contact shadows. Calm, elegant, expensive."
          : kind === "section"
            ? "Luxury architectural section visualization: the building cut exactly where it is cut, the cut faces of walls and slabs crisp and solid, the rooms behind furnished and softly lit, real materials — oak and stone floors, fabric seats, warm white walls — the ground cut as a clean earth section, a clean pale sky. Presentation-board quality."
            : "Luxury architectural cutaway model photograph: the same cut and view, exquisite real materials — oak and stone floors, fabric seats, warm white walls with a crisp section cut — soft daylight from above, gentle ambient occlusion, like a museum-grade presentation model photographed in a studio.";
  return [...keep, look, `Subject: ${subject}.`].join("\n");
}

/** One image call over the model chain. */
export async function finishPass(
  client: GoogleGenAI,
  prompt: string,
  image: Buffer,
): Promise<{ image: Buffer; model: string } | null> {
  const data = (await sharp(image).jpeg({ quality: 92 }).toBuffer()).toString("base64");
  for (const model of getFloorplanVizModelChain()) {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data } }] }],
        config: { responseModalities: ["IMAGE"] },
      });
      recordAiUsage(model, usageFromGemini(res));
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      if (part?.inlineData?.data) return { image: Buffer.from(part.inlineData.data, "base64"), model };
    } catch {
      // The next model in the chain.
    }
  }
  return null;
}

/**
 * How much of the render's structure the finish keeps: the share of the
 * render's strong edges that the finish also has, within 2 px, at 480 px wide
 * — and the share of the finish's strong edges the render has, so a finish
 * that invents structure scores low too. The smaller of the two.
 */
export async function structuralMatch(render: Buffer, finish: Buffer): Promise<number> {
  const meta = await sharp(render).metadata();
  const w = 480;
  const h = Math.round((w * (meta.height ?? 300)) / (meta.width ?? 480));
  const edges = async (img: Buffer) => {
    const { data } = await sharp(img).resize(w, h, { fit: "fill" }).greyscale().blur(0.8).raw().toBuffer({ resolveWithObject: true });
    const mag = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        const gx = data[k + 1]! - data[k - 1]!;
        const gy = data[k + w]! - data[k - w]!;
        mag[k] = Math.hypot(gx, gy);
      }
    }
    // The strongest 8% of edges are the structure.
    const sorted = Float32Array.from(mag).sort();
    const cut = sorted[Math.floor(sorted.length * 0.92)]!;
    const on = new Uint8Array(w * h);
    for (let k = 0; k < mag.length; k++) on[k] = mag[k]! > cut && cut > 0 ? 1 : 0;
    return on;
  };
  const a = await edges(render);
  const b = await edges(finish);
  const near = (m: Uint8Array, k: number) => {
    const x = k % w;
    const y = (k - x) / w;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && m[qy * w + qx]) return true;
      }
    }
    return false;
  };
  let aOn = 0;
  let aHit = 0;
  let bOn = 0;
  let bHit = 0;
  for (let k = 0; k < a.length; k++) {
    if (a[k]) {
      aOn++;
      if (near(b, k)) aHit++;
    }
    if (b[k]) {
      bOn++;
      if (near(a, k)) bHit++;
    }
  }
  return Math.min(aOn ? aHit / aOn : 0, bOn ? bHit / bOn : 0);
}
