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
export type FinishKind = "exterior" | "interior" | "cutaway" | "elevation" | "section" | "photo" | "apartment";

export function finishPrompt(kind: FinishKind, subject: string, options?: { plainGround?: boolean }): string {
  const keep = [
    "This image is an exact architectural render. Repaint it as a professional architectural photograph.",
    "KEEP EXACTLY: the camera position, lens and framing; every wall, opening, window, mullion, column, slab and roof edge in the same place and size; every piece of furniture, its position, size and count; the stair; the trees and cars where they are. There are NO people: do not add any person or human figure anywhere.",
    "Do NOT add, remove, move or resize any element. Do NOT add windows, doors, rooms, storeys, signs or furniture. Do NOT change the building's proportions.",
    "Do NOT add any sign, lettering, logo or text anywhere. Where the render has lettering, keep it where it is.",
    "Keep every retaining wall, terrace edge, ramp and the shape of the ground exactly; do not open up views that the render's walls close.",
  ];
  // Where the render stands the building on a plain plot — no site plan read
  // yet — the model is not to furnish one: it invented a car park, cars, olive
  // trees and a wall round a building whose sheets draw none of them.
  if (options?.plainGround) {
    keep.push(
      "The surroundings are ONLY what the render shows: plain paving round the building. Do NOT add cars, parking bays, roads, trees, planting, lawns, walls, fences, people or neighbouring buildings. Keep the ground plain paving to the edge of the frame, and the sky clear.",
    );
  }
  // An apartment from above, cut at the height of a hand on a door: a sales
  // plan. Its audience's rules are kept here as they are in the render — the
  // render cannot hold a television or a double bed, and the finish may not
  // add one.
  if (kind === "apartment") {
    keep.push(
      "Seen straight from above, the walls cut at about one metre, as in a 3D sales floor plan: keep the cut tops of the walls flat and in the colour rendered, and keep every wall's length and thickness.",
      "Keep every bed single and where it is. Every piece stays the piece it is: a bed stays a bed, a table a table, a cabinet a cabinet — never turn one into a sofa or anything else. Where the render's floor is bare, leave it bare: do not add a sofa, chair, table or cabinet there.",
      "Do NOT add a television, a screen, artwork with faces, people, pets, or any text. Keep the plain light background round the apartment empty.",
    );
  }
  const look =
    kind === "apartment"
      ? "A premium 3D floor plan for a real-estate sales brochure, photographic quality: realistic light oak plank floors in the bedrooms and large-format warm porcelain tiles elsewhere with fine grout lines, small grey tiles in the bathrooms; sofas in soft woven fabric with plump cushions; beds made with crisp white linen and a folded throw; walnut tables and chairs; a dark quartz worktop over white kitchen cabinets with a black glass hob and steel sink; white sanitaryware; potted plants; soft even daylight from above with gentle contact shadows and ambient occlusion in the corners. Clean, bright, calm, true to scale."
      : options?.plainGround && (kind === "exterior" || kind === "photo")
      ? "Luxury architectural visualization, the finest quality: warm honey-toned Jerusalem limestone with natural variation, crisp arrises and fine chisel texture; slim anthracite aluminium frames and laundry screens; deep reflective glazing mirroring the sky; the soft raking light of a clear golden-hour sky, long gentle shadows on clean pale stone paving. Perfect exposure, rich but natural colour, no haze, tack-sharp, photographed by a top architectural photographer on a tilt-shift lens."
      : kind === "exterior" || kind === "photo"
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

/**
 * The apartment designed, not repainted: the measured render is the layout,
 * and the model designs the flat on it as a sales brochure's 3D plan —
 * furniture, upholstery, materials, light and styling all its own — while
 * every wall, opening and piece of furniture stays where, how big and what
 * it is. The checks that follow look at the walls and at the furniture's
 * count and kind, not at how the model styled them.
 */
export function designPrompt(subject: string, options: { haredi: boolean; inventory?: string; style?: string }): string {
  return [
    "Image 1 is an exact top-down LAYOUT of an apartment, measured from the architect's drawing: its walls, doors, windows and every piece of furniture are where they really are.",
    "Design this apartment as a premium, photorealistic 3D floor plan for a real-estate sales brochure, by a top interior designer.",
    "KEEP EXACTLY: the camera — straight down, north up — the framing and the scale; every wall, its length and thickness, and its cut top as a flat band; every door and window opening; every room's shape.",
    "KEEP every piece of furniture where it is, the same size and the same kind: each bed stays a bed in its place (single beds stay single), the dining table with its chairs, each sofa and armchair, each wardrobe, the kitchen run with the hob and the sink exactly where they are, each toilet, basin, shower and bath where it is.",
    ...(options.inventory
      ? [`The furniture exactly as measured, with where each piece stands on the plan (north up) — no more, no fewer, nothing else of these kinds (a bed is ONE person wide: one pillow, never two side by side):
${options.inventory}`]
      : []),
    "DESIGN FREELY: the style of each piece, upholstery and bedding, rugs, floor and wall finishes, kitchen fronts and worktops, lighting and soft shadows, plants and small decor on and beside the furniture.",
    "Do NOT add or remove a room, wall, door, window, bed, sofa, armchair, table, kitchen island or unit, or wardrobe — no coffee table, no extra seating group. Do NOT add a terrace, a garden or anything outside the walls; keep the plain light ground round the apartment. No people, no text, no logos" +
      (options.haredi ? ", no television or screen, no artwork with faces." : "."),
    // The style the run asked for, and the light every style shares: the
    // golden hour and warm palette the owner chose on the sheet-drawn stills.
    ...(options.style ? [options.style] : []),
    `Subject: ${subject}.`,
  ].join("\n");
}

/**
 * A refused design, corrected rather than redrawn: the model is handed the
 * layout and its own design, and told exactly what the judge found wrong. A
 * fresh design keeps the look the model chose and loses a different bed.
 */
export function correctionPrompt(reason: string, options: { inventory?: string }): string {
  return [
    "Image 1 is the exact top-down LAYOUT of an apartment, measured from the architect's drawing. Image 2 is your DESIGN of it.",
    `The design was refused against the layout: ${reason}.`,
    "Edit image 2 so it matches image 1 piece for piece: put back every missing piece where image 1 has it, at its size and of its kind (each bed a single bed, one pillow), and remove every piece image 1 does not have — fill its place with the floor around it.",
    ...(options.inventory ? [`The furniture exactly as measured, with where each piece stands on the plan (north up):
${options.inventory}`] : []),
    "Change nothing else: keep the design's style, materials, colours, golden-hour light and shadows, the camera, the framing, every wall, door and window. No text, no people.",
  ].join("\n");
}

/** One image call over the model chain; images after the first ride along as references. */
export async function finishPass(
  client: GoogleGenAI,
  prompt: string,
  image: Buffer | Buffer[],
): Promise<{ image: Buffer; model: string } | null> {
  const images = await Promise.all(
    (Array.isArray(image) ? image : [image]).map(async (one) => ({
      inlineData: { mimeType: "image/jpeg", data: (await sharp(one).jpeg({ quality: 92 }).toBuffer()).toString("base64") },
    })),
  );
  const first = await sharp(Array.isArray(image) ? image[0]! : image).metadata();
  // 2K costs what 1K does; a 1K design of a flat was 896 px wide. The ratio
  // the layout has, or the model returns its own frame and the walls drift.
  const imageConfig = { imageSize: "2K", aspectRatio: nearestAspectRatio((first.width ?? 1) / (first.height ?? 1)) };
  for (const model of getFloorplanVizModelChain()) {
    // A model that refuses the sizing is asked once more without it.
    for (const sized of [true, false]) {
      try {
        const res = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }, ...images] }],
          config: { responseModalities: ["IMAGE"], ...(sized ? { imageConfig } : {}) },
        });
        recordAiUsage(model, usageFromGemini(res));
        const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
        if (part?.inlineData?.data) return { image: Buffer.from(part.inlineData.data, "base64"), model };
        break;
      } catch {
        // Unsized, then the next model in the chain.
      }
    }
  }
  return null;
}

const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];

/** The image model's aspect ratio closest to width / height. */
export function nearestAspectRatio(ratio: number): string {
  const of = (r: string) => { const [w, h] = r.split(":").map(Number); return w! / h!; };
  return ASPECT_RATIOS.reduce((best, r) => (Math.abs(Math.log(of(r) / ratio)) < Math.abs(Math.log(of(best) / ratio)) ? r : best));
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

/**
 * Whether a painting keeps the walls where the measurement put them.
 *
 * `walls` is the measured walls alone, black on white, in the painting's
 * frame. Its outline — every wall face — is the structure; the share of it
 * the painting also has an edge on, within 3 px at 480 px wide, is the score.
 * Nothing but walls is asked of the painting here: it may restyle every piece
 * of furniture, which the edges of a whole render would have counted against
 * it.
 */
export async function wallMatch(walls: Buffer, painting: Buffer): Promise<number> {
  const meta = await sharp(walls).metadata();
  const w = 480;
  const h = Math.round((w * (meta.height ?? 300)) / (meta.width ?? 480));
  const wallsPx = (await sharp(walls).resize(w, h, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })).data;
  const ink = (k: number) => wallsPx[k]! < 128;
  const outline = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (ink(k) && (!ink(k - 1) || !ink(k + 1) || !ink(k - w) || !ink(k + w))) outline[k] = 1;
    }
  }
  const { data } = await sharp(painting).resize(w, h, { fit: "fill" }).greyscale().blur(0.8).raw().toBuffer({ resolveWithObject: true });
  const mag = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      mag[k] = Math.hypot(data[k + 1]! - data[k - 1]!, data[k + w]! - data[k - w]!);
    }
  }
  const sorted = Float32Array.from(mag).sort();
  const cut = sorted[Math.floor(sorted.length * 0.85)]!;
  let on = 0;
  let hit = 0;
  for (let k = 0; k < outline.length; k++) {
    if (!outline[k]) continue;
    on++;
    const x = k % w;
    const y = (k - x) / w;
    search: for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && mag[qy * w + qx]! > cut && cut > 0) {
          hit++;
          break search;
        }
      }
    }
  }
  return on ? hit / on : 0;
}

/**
 * Whether the finish keeps the render's masses where they are: both images
 * at 96 px wide, blurred, as light and dark, and the correlation of the two.
 * Edges alone pass a close-up the model redrew: stone courses line up with
 * stone courses wherever they fall. The light and dark of the masses — a
 * wing in shadow, a band of sky, a slab's underside — does not.
 */
export async function massMatch(render: Buffer, finish: Buffer): Promise<number> {
  const meta = await sharp(render).metadata();
  const w = 96;
  const h = Math.max(8, Math.round((w * (meta.height ?? 300)) / (meta.width ?? 480)));
  const grey = async (img: Buffer) => (await sharp(img).resize(w, h, { fit: "fill" }).greyscale().blur(1.5).raw().toBuffer({ resolveWithObject: true })).data;
  const a = await grey(render);
  const b = await grey(finish);
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let ab = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - ma;
    const db = b[i]! - mb;
    ab += da * db;
    aa += da * da;
    bb += db * db;
  }
  return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
}
