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

export function finishPrompt(
  kind: FinishKind,
  subject: string,
  options?: {
    plainGround?: boolean;
    /** The run's own style, in place of the built-in look: a flat is in the style its owner chose. */
    look?: string;
  },
): string {
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
  return [...keep, options?.look ?? look, `Subject: ${subject}.`].join("\n");
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
    "KEEP EXACTLY: the camera — straight down, north up — the framing and the scale; every wall, its length and thickness, and its cut top as a flat band; every door and window opening; every room's shape; each terrace's railing — the glass balustrade with its metal handrail along every open edge of a terrace — exactly where it runs.",
    "KEEP every piece of furniture where it is, the same size and the same kind: each bed stays a bed in its place (single beds stay single), the dining table with its chairs, each sofa and armchair, each wardrobe, the kitchen run with the hob and the sink exactly where they are, each toilet, basin, shower and bath where it is.",
    ...(options.inventory
      ? [`The furniture exactly as measured, with where each piece stands on the plan (north up) — no more, no fewer, nothing else of these kinds (a bed is ONE person wide: one pillow, never two side by side):
${options.inventory}`]
      : []),
    "DESIGN FREELY: the style of each piece, upholstery and bedding, rugs, floor and wall finishes, kitchen fronts and worktops, lighting and soft shadows, plants and small decor on and beside the furniture.",
    // A desk and its chair were added to two of 14's bedrooms, and a pair of
    // beds to 17's living room: named, each is a piece the layout lacks.
    "Do NOT add or remove a room, wall, door, window, bed, sofa, armchair, chair, table, desk, kitchen island or unit, wardrobe or cabinet — no coffee table, no desk with its chair, no extra seating group, no bed outside the bedrooms, no shelving, bookcase or built-in unit along a wall the layout leaves bare. Do NOT add a terrace, a garden or anything outside the walls; keep the plain light ground round the apartment. No people, no text, no logos" +
      (options.haredi ? ", no television or screen, no artwork with faces." : "."),
    // The style the run asked for, and the light every style shares: the
    // golden hour and warm palette the owner chose on the sheet-drawn stills.
    ...(options.style ? [options.style] : []),
    `Subject: ${subject}.`,
  ].join("\n");
}

/** Where in a frame a point is, in thirds: "top left", "middle", "bottom right". */
function framePlace(fx: number, fy: number): string {
  const row = ["top", "middle", "bottom"][Math.min(2, Math.floor(fy * 3))]!;
  const col = ["left", "centre", "right"][Math.min(2, Math.floor(fx * 3))]!;
  return row === "middle" && col === "centre" ? "middle" : row === "middle" ? `middle ${col}` : col === "centre" ? `${row} centre` : `${row} ${col}`;
}

/**
 * A refused design, corrected rather than redrawn: the model is handed the
 * layout and its own design, and told exactly what the judge found wrong. A
 * fresh design keeps the look the model chose and loses a different bed.
 */
export function correctionPrompt(reason: string, options: { inventory?: string; style?: string; marked?: boolean }): string {
  return [
    // The design first: the model edits the first image it is given, and
    // with the layout first a correction came back as pale as the layout.
    "Image 1 is your DESIGN of an apartment seen from above. Image 2 is the exact top-down LAYOUT it was designed on, measured from the architect's drawing.",
    `The design was refused against the layout: ${reason}.`,
    ...(options.marked
      ? [
          "Image 3 is image 1 with the faults framed: inside each RED frame the design added something image 2 does not have there — take it out and leave plain floor; inside each BLUE frame image 2 has a piece the design lost or changed — put image 2's piece back there. The frames show you where; do not draw any frame, line or mark in your image.",
        ]
      : []),
    "Edit image 1 so it matches image 2 where it was refused: put every wall, door and window and every piece of furniture back where image 2 has it, at its size and of its kind (each bed a single bed, one pillow), and take out what image 2 does not have, filling its place with the floor around it.",
    ...(options.inventory ? [`The furniture exactly as measured, with where each piece stands on the plan (north up):
${options.inventory}`] : []),
    "Keep everything else of image 1 as it is: its style, materials, colours, warm golden-hour light, shadows and finish quality, the camera and the framing. It must stay a finished, photorealistic sales image, not a diagram. No text, no people.",
    ...(options.style ? [options.style] : []),
  ].join("\n");
}

/**
 * The size a model is asked for where the caller names none: on Pro 2K costs
 * what 1K does (a 1K design of a flat was 896 px wide); on every other model
 * 2K costs half as much again.
 */
export function finishImageSize(model: string): FinishImageSize {
  return /-pro(-|$)/i.test(model) ? "2K" : "1K";
}

/** The sizes an image model is asked for: 4K only by a caller that names it (a whole storey's plan in one call). */
export type FinishImageSize = "1K" | "2K" | "4K";

const errorText = (err: unknown) => `${err instanceof Error ? err.message : String(err)} ${JSON.stringify(err ?? "")}`.toLowerCase();

/** The request's own fault — the sizing a model does not take: asked once more without it. */
function sizingRefused(err: unknown): boolean {
  const text = errorText(err);
  return /\b400\b|invalid_argument|invalid argument/.test(text) && /image_?config|image ?size|aspect/.test(text);
}

/** A fault no other model mends: the key, the account's quota or billing. */
function accountFault(err: unknown): boolean {
  return /\b40[13]\b|api[_ ]key|permission|billing|unauthenticated/.test(errorText(err));
}

/**
 * One image call over the model chain; images after the first ride along as
 * references. The next model is asked only where the last made no billed
 * answer — it is not there, or busy; an answer without a picture was billed,
 * and is the caller's to ask again within its attempts, not the chain's.
 */
export async function finishPass(
  client: GoogleGenAI,
  prompt: string,
  image: Buffer | Buffer[],
  models: string[] = getFloorplanVizModelChain(),
  imageSize?: FinishImageSize,
  signal?: AbortSignal,
  /** The wide and tall frames (WIDE_ASPECT_RATIOS) too: only Nano Banana 2.1 takes them; another model is asked again unsized. */
  wide = false,
): Promise<{ image: Buffer; model: string } | null> {
  const images = await Promise.all(
    (Array.isArray(image) ? image : [image]).map(async (one) => ({
      inlineData: { mimeType: "image/jpeg", data: (await sharp(one).jpeg({ quality: 92 }).toBuffer()).toString("base64") },
    })),
  );
  const first = await sharp(Array.isArray(image) ? image[0]! : image).metadata();
  // The ratio the layout has, or the model returns its own frame and the walls drift.
  const aspectRatio = nearestAspectRatio((first.width ?? 1) / (first.height ?? 1), wide);
  for (const model of models) {
    const imageConfig = { imageSize: imageSize ?? finishImageSize(model), aspectRatio };
    for (const sized of [true, false]) {
      if (signal?.aborted) return null;
      let res: Awaited<ReturnType<GoogleGenAI["models"]["generateContent"]>>;
      try {
        res = await client.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: prompt }, ...images] }],
          config: { responseModalities: ["IMAGE"], ...(sized ? { imageConfig } : {}), ...(signal ? { abortSignal: signal } : {}) },
        });
      } catch (err: unknown) {
        if (signal?.aborted || accountFault(err)) return null;
        if (sized && sizingRefused(err)) continue;
        break;
      }
      recordAiUsage(model, usageFromGemini(res));
      const part = res.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
      return part?.inlineData?.data ? { image: Buffer.from(part.inlineData.data, "base64"), model } : null;
    }
  }
  return null;
}

export const ASPECT_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
/** Nano Banana 2.1's strips besides (Google's page, 15/10/2026): asked for only where a caller allows them. */
export const WIDE_ASPECT_RATIOS = ["4:1", "1:4", "8:1", "1:8"];

/** The ratios a call may be framed to. */
export function aspectRatios(wide = false): string[] {
  return wide ? [...ASPECT_RATIOS, ...WIDE_ASPECT_RATIOS] : ASPECT_RATIOS;
}

/** The image model's aspect ratio closest to width / height. */
export function nearestAspectRatio(ratio: number, wide = false): string {
  const of = (r: string) => { const [w, h] = r.split(":").map(Number); return w! / h!; };
  return aspectRatios(wide).reduce((best, r) => (Math.abs(Math.log(of(r) / ratio)) < Math.abs(Math.log(of(best) / ratio)) ? r : best));
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
  return (await wallMatchDetail(walls, painting)).all;
}

/**
 * The walls kept, over the whole frame and in its worst part: the frame cut
 * into a grid of about 1.5 m cells, each with enough wall in it scored on its
 * own. A design that redrew one bathroom kept 95 % of the flat's walls; the
 * bathroom's cell kept far fewer.
 */
export async function wallMatchDetail(
  walls: Buffer,
  painting: Buffer,
  /**
   * The render the walls map was drawn with. Where given, only the stretches
   * of wall face the render itself shows as an edge are scored: a wall's cut
   * top is the colour of the paper round the flat, and on the side the sun
   * casts no shadow its outer face shows no edge at all — the measured still
   * scored 0.83 against its own walls on 18 and 22, and no design could pass.
   */
  reference?: Buffer,
): Promise<{ all: number; worstCell: number; driftedAt: string[] }> {
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
  /** Each pixel's edge strength, and the strength the strongest 15 % pass. */
  const edgesOf = async (img: Buffer) => {
    const { data } = await sharp(img).resize(w, h, { fit: "fill" }).greyscale().blur(0.8).raw().toBuffer({ resolveWithObject: true });
    const strength = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        strength[k] = Math.hypot(data[k + 1]! - data[k - 1]!, data[k + w]! - data[k - w]!);
      }
    }
    const sortedStrength = Float32Array.from(strength).sort();
    return { strength, cut: sortedStrength[Math.floor(sortedStrength.length * 0.85)]! };
  };
  const edgeNear = (e: { strength: Float32Array; cut: number }, x: number, y: number) => {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && e.strength[qy * w + qx]! > e.cut && e.cut > 0) return true;
      }
    }
    return false;
  };
  if (reference) {
    const ref = await edgesOf(reference);
    for (let k = 0; k < outline.length; k++) {
      if (outline[k] && !edgeNear(ref, k % w, Math.floor(k / w))) outline[k] = 0;
    }
  }
  const { strength: mag, cut } = await edgesOf(painting);
  let on = 0;
  let hit = 0;
  const GRID = 8;
  const cellW = w / GRID;
  const rows = Math.max(1, Math.round(h / cellW));
  const cellOn = new Uint32Array(GRID * rows);
  const cellHit = new Uint32Array(GRID * rows);
  for (let k = 0; k < outline.length; k++) {
    if (!outline[k]) continue;
    on++;
    const x = k % w;
    const y = (k - x) / w;
    const cell = Math.min(rows - 1, Math.floor(y / cellW)) * GRID + Math.min(GRID - 1, Math.floor(x / cellW));
    cellOn[cell] = cellOn[cell]! + 1;
    search: for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && mag[qy * w + qx]! > cut && cut > 0) {
          hit++;
          cellHit[cell] = cellHit[cell]! + 1;
          break search;
        }
      }
    }
  }
  // A cell scored on its own once it holds a wall's run across it.
  let worstCell = 1;
  const drifted = new Set<string>();
  for (let c = 0; c < cellOn.length; c++) {
    if (cellOn[c]! < cellW * 1.5) continue;
    const kept = cellHit[c]! / cellOn[c]!;
    worstCell = Math.min(worstCell, kept);
    if (kept < 0.75) drifted.add(framePlace((c % GRID) / GRID + 0.5 / GRID, Math.floor(c / GRID) / rows + 0.5 / rows));
  }
  return { all: on ? hit / on : 0, worstCell: on ? worstCell : 0, driftedAt: [...drifted] };
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

/** A part of a painting that is not its render's: where, and its box as shares of the frame. */
export type LocalFault = { place: string; box: { x: number; y: number; w: number; h: number } };

/** The render at 480 px wide, cut into its plain surfaces, which of them is the sky, and the far land under it. */
type Surfaces = { w: number; h: number; r: Buffer; label: Int32Array; sizes: number[]; sky: number; far: Set<number> };

const LOCAL_WIDTH = 480;

async function surfacesOf(render: Buffer): Promise<Surfaces> {
  const meta = await sharp(render).metadata();
  const w = LOCAL_WIDTH;
  const h = Math.max(8, Math.round((w * (meta.height ?? 300)) / (meta.width ?? 480)));
  const n = w * h;
  const r = (await sharp(render).resize(w, h, { fit: "fill" }).removeAlpha().blur(1.2).raw().toBuffer({ resolveWithObject: true })).data;
  // Runs of pixels each within a step of its neighbour and of the run's own
  // colour: a soft seam is many small steps, and the sky ran down a
  // parapet's face into the roof.
  const label = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const step = (a: number, b: number) =>
    Math.max(Math.abs(r[a * 3]! - r[b * 3]!), Math.abs(r[a * 3 + 1]! - r[b * 3 + 1]!), Math.abs(r[a * 3 + 2]! - r[b * 3 + 2]!)) <= 4;
  for (let start = 0; start < n; start++) {
    if (label[start] !== -1) continue;
    const id = sizes.length;
    const stack = [start];
    label[start] = id;
    const sum = [r[start * 3]!, r[start * 3 + 1]!, r[start * 3 + 2]!];
    let size = 0;
    while (stack.length) {
      const k = stack.pop()!;
      size++;
      const x = k % w;
      for (const q of [x > 0 ? k - 1 : -1, x < w - 1 ? k + 1 : -1, k - w, k + w]) {
        if (q < 0 || q >= n || label[q] !== -1 || !step(k, q)) continue;
        const held = size + stack.length;
        if (![0, 1, 2].every((c) => Math.abs(r[q * 3 + c]! - sum[c]! / held) <= 14)) continue;
        label[q] = id;
        for (let c = 0; c < 3; c++) sum[c] = sum[c]! + r[q * 3 + c]!;
        stack.push(q);
      }
    }
    sizes.push(size);
  }
  // The sky: the surface along most of the top edge, and high in the frame —
  // a top-down view's lawn runs along the top edge too, and down the frame.
  const topRow = new Map<number, number>();
  for (let x = 0; x < w; x++) topRow.set(label[x]!, (topRow.get(label[x]!) ?? 0) + 1);
  const [skyId, skyRow] = [...topRow].reduce((a, b) => (b[1] > a[1] ? b : a));
  let skyY = 0;
  for (let k = 0; k < n; k++) if (label[k] === skyId) skyY += Math.floor(k / w);
  const sky = skyRow >= w / 2 && skyY / sizes[skyId]! < h * 0.4 ? skyId : -1;
  // The far land: a plain surface under the sky reaching the frame's left or
  // right edge, high in the frame — the empty ground past the plot,
  // where the painting is asked for a distant neighbourhood and hills. Held
  // to the render there, model A's best photograph of 12/10/2026 was refused
  // as "invented objects" at its top corners, and its four repairs lost the
  // planting and the light.
  const far = new Set<number>();
  if (sky >= 0) {
    // The render's sky is bands (a pale top, a bluer one under it): the land is under the last, not the first.
    const touch = new Map<number, { left: boolean; right: boolean; top: number; y: number }>();
    for (let k = 0; k < n; k++) {
      const id = label[k]!;
      if (id === sky || sizes[id]! < n * 0.005) continue;
      const x = k % w;
      const t = touch.get(id) ?? { left: false, right: false, top: h, y: 0 };
      if (x === 0) t.left = true;
      if (x === w - 1) t.right = true;
      t.top = Math.min(t.top, Math.floor(k / w));
      t.y += Math.floor(k / w);
      touch.set(id, t);
    }
    for (const [id, t] of touch) if (sizes[id]! >= n * 0.03 && (t.left || t.right) && t.top < h * 0.25 && t.y / sizes[id]! < h * 0.4) far.add(id);
    // And the grass at the frame's side, high in it: the land past the
    // boundary wall, where the painting set the distant houses.
    for (const [id, t] of touch) {
      const k = label.indexOf(id);
      const [rr, gg, bb] = [r[k * 3]!, r[k * 3 + 1]!, r[k * 3 + 2]!];
      if ((t.left || t.right) && t.top < h * 0.4 && gg > rr && gg > bb + 20) far.add(id);
    }
  }
  return { w, h, r, label, sizes, sky, far };
}

/**
 * What a painting invented, part by part. The edge and mass scores are the
 * whole frame's: a lounge suite painted on a bare roof moved a few per cent of
 * either, and passed.
 *
 * Away from the seams of the render's plain surfaces — a roof, a wall face, a
 * stretch of paving — the painting's own edges are looked at 16 px at a time.
 * Paint adds texture there, too faint to count; a shadow adds a line, all one
 * way. A thing stood on the surface adds strong edges that run every way,
 * close together; five such windows touching are an invention. The sky is
 * left out — the painter redraws every tree against it, and a thing on a roof
 * is seen against the roof — and so is foliage.
 */
export async function inventedObjects(render: Buffer, painting: Buffer, surfaces?: Surfaces): Promise<LocalFault[]> {
  const { w, h, label, sizes, sky, far } = surfaces ?? (await surfacesOf(render));
  const n = w * h;
  const p = (await sharp(painting).resize(w, h, { fit: "fill" }).removeAlpha().blur(1.2).raw().toBuffer({ resolveWithObject: true })).data;
  // A painting's edges wander a few pixels from the render's.
  const SEAM = 4;
  const inside = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (sizes[label[k]!]! < n * 0.002 || label[k] === sky || far.has(label[k]!)) continue;
    const x = k % w;
    const y = (k - x) / w;
    let ok = true;
    for (let dy = -SEAM; dy <= SEAM && ok; dy++) {
      for (let dx = -SEAM; dx <= SEAM; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx < 0 || qy < 0 || qx >= w || qy >= h || label[qy * w + qx] !== label[k]) {
          ok = false;
          break;
        }
      }
    }
    inside[k] = ok ? 1 : 0;
  }
  const lum = (k: number) => (p[k * 3]! + p[k * 3 + 1]! + p[k * 3 + 2]!) / 3;
  const WIN = 16;
  const STRIDE = 8;
  const cols = Math.floor((w - WIN) / STRIDE) + 1;
  const rows = Math.floor((h - WIN) / STRIDE) + 1;
  const flagged = new Uint8Array(cols * rows);
  for (let wy = 0; wy < rows; wy++) {
    for (let wx = 0; wx < cols; wx++) {
      let plain = 0;
      let strong = 0;
      let green = 0;
      let warm = 0;
      let [jxx, jyy, jxy] = [0, 0, 0];
      for (let y = Math.max(1, wy * STRIDE); y < Math.min(h - 1, wy * STRIDE + WIN); y++) {
        for (let x = Math.max(1, wx * STRIDE); x < Math.min(w - 1, wx * STRIDE + WIN); x++) {
          const k = y * w + x;
          if (!inside[k]) continue;
          plain++;
          if (p[k * 3 + 1]! >= p[k * 3]! && p[k * 3 + 1]! > p[k * 3 + 2]! + 8) green++;
          // Flowers are planting too: the bougainvillea and lavender the house's
          // garden is painted with are magenta and violet, not green.
          else if (p[k * 3]! > p[k * 3 + 1]! + 30 && p[k * 3 + 2]! > p[k * 3 + 1]! + 10) green++;
          // A wall light's warm glow on the plaster is light, not an object.
          if (lum(k) > 170 && p[k * 3]! > p[k * 3 + 2]! + 45) warm++;
          const gx = lum(k + 1) - lum(k - 1);
          const gy = lum(k + w) - lum(k - w);
          if (Math.hypot(gx, gy) < 20) continue;
          strong++;
          jxx += gx * gx;
          jyy += gy * gy;
          jxy += gx * gy;
        }
      }
      if (plain < WIN * WIN * 0.4 || strong < plain * 0.2 || green >= plain * 0.3 || warm >= plain * 0.12) continue;
      // How much the edges run one way: 1 for a line, 0 for every way at once.
      const oneWay = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy) / (jxx + jyy);
      if (oneWay < 0.6) flagged[wy * cols + wx] = 1;
    }
  }
  const seen = new Uint8Array(flagged.length);
  const found: LocalFault[] = [];
  for (let start = 0; start < flagged.length; start++) {
    if (!flagged[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let [x0, x1, y0, y1, windows] = [w, 0, h, 0, 0];
    while (stack.length) {
      const i = stack.pop()!;
      const cx = i % cols;
      const cy = (i - cx) / cols;
      windows++;
      [x0, x1, y0, y1] = [Math.min(x0, cx * STRIDE), Math.max(x1, cx * STRIDE + WIN), Math.min(y0, cy * STRIDE), Math.max(y1, cy * STRIDE + WIN)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const qx = cx + dx;
          const qy = cy + dy;
          const q = qy * cols + qx;
          if (qx < 0 || qy < 0 || qx >= cols || qy >= rows || seen[q] || !flagged[q]) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    // Four was a post the painting set a few pixels off; the lounge suite on a roof was six.
    if (windows < 5) continue;
    found.push({ place: framePlace((x0 + x1) / 2 / w, (y0 + y1) / 2 / h), box: { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h } });
  }
  return found;
}

/**
 * What a painting lost, part by part: the frame cut into 48 px cells at 480
 * px wide, and in each cell holding a run of the render's structure, the
 * share of it the painting keeps an edge on within 3 px. A window painted
 * over keeps a fraction of its cell. Not counted: the render's trees, which
 * every painting redraws, and the sky's edge — the render's horizon, which a
 * painting with its sky down to the hills has nowhere.
 */
export async function lostStructure(render: Buffer, painting: Buffer, surfaces?: Surfaces): Promise<LocalFault[]> {
  const { w, h, label, sky } = surfaces ?? (await surfacesOf(render));
  const n = w * h;
  const read = async (img: Buffer) => (await sharp(img).resize(w, h, { fit: "fill" }).removeAlpha().blur(0.8).raw().toBuffer({ resolveWithObject: true })).data;
  const r = await read(render);
  const p = await read(painting);
  const strength = (d: Buffer) => {
    const out = new Float32Array(n);
    const l = (q: number) => (d[q * 3]! + d[q * 3 + 1]! + d[q * 3 + 2]!) / 3;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const k = y * w + x;
        out[k] = Math.hypot(l(k + 1) - l(k - 1), l(k + w) - l(k - w));
      }
    }
    return out;
  };
  const cutOf = (s: Float32Array, share: number) => Float32Array.from(s).sort()[Math.floor(n * share)]!;
  const rs = strength(r);
  const ps = strength(p);
  const rCut = Math.max(8, cutOf(rs, 0.92));
  // The painting's edges, generously: it softens what the render draws hard.
  const pCut = Math.max(6, cutOf(ps, 0.8));
  const leafy = (k: number) => r[k * 3 + 1]! > r[k * 3]! + 12 && r[k * 3 + 1]! > r[k * 3 + 2]! + 12;
  const nearSky = (x: number, y: number) => {
    if (sky < 0) return false;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const qx = x + dx;
        const qy = y + dy;
        if (qx >= 0 && qy >= 0 && qx < w && qy < h && label[qy * w + qx] === sky) return true;
      }
    }
    return false;
  };
  const CELL = 48;
  const cols = Math.ceil(w / CELL);
  const rows = Math.ceil(h / CELL);
  const on = new Uint32Array(cols * rows);
  const hit = new Uint32Array(cols * rows);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const k = y * w + x;
      if (rs[k]! <= rCut || leafy(k) || nearSky(x, y)) continue;
      const c = Math.floor(y / CELL) * cols + Math.floor(x / CELL);
      on[c]!++;
      search: for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          if (qx >= 0 && qy >= 0 && qx < w && qy < h && ps[qy * w + qx]! > pCut) {
            hit[c]!++;
            break search;
          }
        }
      }
    }
  }
  const found: LocalFault[] = [];
  for (let c = 0; c < on.length; c++) {
    if (on[c]! < CELL * 1.5 || hit[c]! >= on[c]! * 0.4) continue;
    const [x, y] = [(c % cols) * CELL, Math.floor(c / cols) * CELL];
    const [cw, ch] = [Math.min(CELL, w - x), Math.min(CELL, h - y)];
    found.push({ place: framePlace((x + cw / 2) / w, (y + ch / 2) / h), box: { x: x / w, y: y / h, w: cw / w, h: ch / h } });
  }
  return found;
}

/**
 * A railing the painting set on a wall the render leaves bare. Its bars are
 * thin lines, all one way, a few pixels apart: the edge-window check takes
 * them for a shadow, and at 480 px they are not there at all. So: at the
 * render's own width (to 1600 px), runs of four or more thin upright bars
 * within 21 px of each other, away from grass and leaves — and kept only where
 * the render has no thin line of its own within a few pixels. The street
 * railing the render does draw is a rail and a band, a thin line along all of
 * it; a coping beside a lawn is a broad band, and has none.
 */
export async function addedRailings(render: Buffer, painting: Buffer): Promise<LocalFault[]> {
  const meta = await sharp(render).metadata();
  const w = Math.min(1600, meta.width ?? 1400);
  const h = Math.max(8, Math.round((w * (meta.height ?? 875)) / (meta.width ?? 1400)));
  const n = w * h;
  const read = async (img: Buffer) => (await sharp(img).resize(w, h, { fit: "fill" }).removeAlpha().raw().toBuffer({ resolveWithObject: true })).data;
  const [p, r] = await Promise.all([read(painting), read(render)]);
  const lumOf = (d: Buffer) => {
    const out = new Float32Array(n);
    for (let k = 0; k < n; k++) out[k] = (d[k * 3]! + d[k * 3 + 1]! + d[k * 3 + 2]!) / 3;
    return out;
  };
  const pl = lumOf(p);
  const rl = lumOf(r);
  // Five rows together: a bar runs down them, a blade of grass or a speck does not.
  const L = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -2; dy <= 2; dy++) sum += pl[Math.min(h - 1, Math.max(0, y + dy)) * w + x]!;
      L[y * w + x] = sum / 5;
    }
  }
  const A = 30;
  const leafy = (k: number) => p[k * 3 + 1]! > p[k * 3]! + 6 && p[k * 3 + 1]! > p[k * 3 + 2]! + 6;
  const bar = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 2; x < w - 2; x++) {
      const k = y * w + x;
      if (leafy(k)) continue;
      const [a, b, c] = [L[k - 2]!, L[k]!, L[k + 2]!];
      if ((b < a - A && b < c - A) || (b > a + A && b > c + A)) bar[k] = 1;
    }
  }
  const RUN = 10;
  const rail = new Uint8Array(n);
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < Math.min(w, RUN); x++) count += bar[y * w + x]!;
    for (let x = 0; x < w; x++) {
      if (x + RUN < w) count += bar[y * w + x + RUN]!;
      if (x - RUN - 1 >= 0) count -= bar[y * w + x - RUN - 1]!;
      if (bar[y * w + x] && count >= 4) rail[y * w + x] = 1;
    }
  }
  // The render's thin lines: darker or lighter than the pixels 3 px either side, any way round.
  const line = new Uint8Array(n);
  const T = 25;
  for (let y = 3; y < h - 3; y++) {
    for (let x = 3; x < w - 3; x++) {
      const k = y * w + x;
      const v = rl[k]!;
      for (const d of [3, 3 * w, 3 * w + 3, 3 * w - 3]) {
        const [a, b] = [rl[k - d]!, rl[k + d]!];
        if (v < a - T && v < b - T) {
          line[k] = 1;
          break;
        }
      }
    }
  }
  // Only long ones: a rail runs the wall's length, a stone's joints are dashes.
  const long = new Uint8Array(n);
  const reach = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (!line[start] || reach[start]) continue;
    const run = [start];
    reach[start] = 1;
    let [x0, x1, y0, y1] = [w, 0, h, 0];
    for (let i = 0; i < run.length; i++) {
      const k = run[i]!;
      const x = k % w;
      const y = (k - x) / w;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const q = (y + dy) * w + x + dx;
          if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h || reach[q] || !line[q]) continue;
          reach[q] = 1;
          run.push(q);
        }
      }
    }
    if (Math.max(x1 - x0, y1 - y0) >= w * 0.03) for (const k of run) long[k] = 1;
  }
  const NEAR = 5;
  const lineSum = new Uint32Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) lineSum[(y + 1) * (w + 1) + x + 1] = long[y * w + x]! + lineSum[y * (w + 1) + x + 1]! + lineSum[(y + 1) * (w + 1) + x]! - lineSum[y * (w + 1) + x]!;
  }
  const lineNear = (x: number, y: number) => {
    const [x0, y0, x1, y1] = [Math.max(0, x - NEAR), Math.max(0, y - NEAR), Math.min(w, x + NEAR + 1), Math.min(h, y + NEAR + 1)];
    return lineSum[y1 * (w + 1) + x1]! - lineSum[y0 * (w + 1) + x1]! - lineSum[y1 * (w + 1) + x0]! + lineSum[y0 * (w + 1) + x0]! > 0;
  };
  // A railing's bars, joined across the gaps between them.
  const seen = new Uint8Array(n);
  const found: LocalFault[] = [];
  const GAP = 4;
  for (let start = 0; start < n; start++) {
    if (!rail[start] || seen[start]) continue;
    const stack = [start];
    seen[start] = 1;
    let [x0, x1, y0, y1, bars, bare] = [w, 0, h, 0, 0, 0];
    let [sx, sy, sxx, syy, sxy] = [0, 0, 0, 0, 0];
    while (stack.length) {
      const k = stack.pop()!;
      const x = k % w;
      const y = (k - x) / w;
      bars++;
      [sx, sy, sxx, syy, sxy] = [sx + x, sy + y, sxx + x * x, syy + y * y, sxy + x * y];
      if (!lineNear(x, y)) bare++;
      [x0, x1, y0, y1] = [Math.min(x0, x), Math.max(x1, x), Math.min(y0, y), Math.max(y1, y)];
      for (let dy = -GAP; dy <= GAP; dy++) {
        for (let dx = -GAP; dx <= GAP; dx++) {
          const qx = x + dx;
          const qy = y + dy;
          const q = qy * w + qx;
          if (qx < 0 || qy < 0 || qx >= w || qy >= h || seen[q] || !rail[q]) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    // How long the run is for its breadth: a railing is a long thin band, a car's grille or a shrub is not.
    const [cxx, cyy, cxy] = [sxx / bars - (sx / bars) ** 2, syy / bars - (sy / bars) ** 2, sxy / bars - (sx / bars) * (sy / bars)];
    const spread = Math.sqrt((cxx - cyy) ** 2 + 4 * cxy * cxy);
    const slender = Math.sqrt((cxx + cyy + spread) / Math.max(1e-6, cxx + cyy - spread));
    // A car's grille was 4.5, a shrub 1.2–4; the railings set on garden walls 7 to 35.
    if (Math.max(x1 - x0, y1 - y0) < w * 0.04 || bars < 40 || bare < bars * 0.5 || slender < 6) continue;
    found.push({ place: framePlace((x0 + x1) / 2 / w, (y0 + y1) / 2 / h), box: { x: x0 / w, y: y0 / h, w: (x1 - x0 + 1) / w, h: (y1 - y0 + 1) / h } });
  }
  return found;
}

/**
 * A furnished plan's painting checked piece by piece against its render: the
 * render's pieces are its small plain surfaces standing apart from the floor
 * round them (a bed, a bath, a table, a car). Each must still be a thing in
 * the painting — not painted over as floor — and keep its material's tone:
 * a white tub is not painted a grey sofa. The render is furnished from the
 * sheet (the furniture audit, 136 of 136), so it is the authority; asked of
 * a vision model instead, the answer turned from "bath missing" to "bed
 * added" on the same faithful painting (Gottlieb A, 12/10/2026).
 */
export async function furnitureFaults(render: Buffer, painting: Buffer, mask?: Buffer): Promise<{ lost: LocalFault[]; changed: LocalFault[]; added: LocalFault[]; pieces: number }> {
  const surfaces = await surfacesOf(render);
  const { w, h, r, label, sizes } = surfaces;
  const n = w * h;
  const p = (await sharp(painting).resize(w, h, { fit: "fill" }).removeAlpha().blur(1.2).raw().toBuffer({ resolveWithObject: true })).data;
  // Inside the house only: the plan's parked cars, painted real as they are
  // asked to be, were "pieces turned to another thing" against the render's
  // boxes, and the yard's shade "added pieces" (Gottlieb A, 12/10/2026).
  const inHouse = new Uint8Array(n).fill(1);
  if (mask) {
    const m = (await sharp(mask).resize(w, h, { fit: "fill" }).greyscale().raw().toBuffer({ resolveWithObject: true })).data;
    for (let k = 0; k < n; k++) inHouse[k] = m[k]! > 127 ? 1 : 0;
  }
  const box = new Map<number, { x0: number; y0: number; x1: number; y1: number; sum: [number, number, number] }>();
  for (let k = 0; k < n; k++) {
    const id = label[k]!;
    if (sizes[id]! < n * 0.0004 || sizes[id]! > n * 0.012) continue;
    const x = k % w;
    const y = (k - x) / w;
    const b = box.get(id) ?? { x0: x, y0: y, x1: x, y1: y, sum: [0, 0, 0] as [number, number, number] };
    [b.x0, b.y0, b.x1, b.y1] = [Math.min(b.x0, x), Math.min(b.y0, y), Math.max(b.x1, x), Math.max(b.y1, y)];
    for (let c = 0; c < 3; c++) b.sum[c] = b.sum[c]! + r[k * 3 + c]!;
    box.set(id, b);
  }
  const lum = (buf: Buffer, k: number) => (buf[k * 3]! + buf[k * 3 + 1]! + buf[k * 3 + 2]!) / 3;
  const lost: LocalFault[] = [];
  const changed: LocalFault[] = [];
  let pieces = 0;
  for (const [id, b] of box) {
    const bw = b.x1 - b.x0 + 1;
    const bh = b.y1 - b.y0 + 1;
    if (!inHouse[Math.round((b.y0 + b.y1) / 2) * w + Math.round((b.x0 + b.x1) / 2)]) continue;
    // A piece is compact: most of its box is itself (a wall's strip or a floor's band is not).
    if (sizes[id]! < 0.55 * bw * bh || Math.max(bw, bh) > 8 * Math.min(bw, bh)) continue;
    // ...and stands apart from what is round it in the render: a ring 3 px out, of another tone.
    const ring: number[] = [];
    for (let y = Math.max(0, b.y0 - 3); y <= Math.min(h - 1, b.y1 + 3); y++) {
      for (let x = Math.max(0, b.x0 - 3); x <= Math.min(w - 1, b.x1 + 3); x++) {
        if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) continue;
        ring.push(y * w + x);
      }
    }
    if (ring.length === 0) continue;
    const mean = (buf: Buffer, ks: number[]) => {
      const m = [0, 0, 0];
      for (const k of ks) for (let c = 0; c < 3; c++) m[c] = m[c]! + buf[k * 3 + c]!;
      return m.map((v) => v / ks.length);
    };
    const inside: number[] = [];
    for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (label[y * w + x] === id) inside.push(y * w + x);
    const dist = (a: number[], c: number[]) => Math.hypot(a[0]! - c[0]!, a[1]! - c[1]!, a[2]! - c[2]!);
    const rIn = mean(r, inside);
    const rRing = mean(r, ring);
    if (dist(rIn, rRing) < 25) continue;
    pieces++;
    const pIn = mean(p, inside);
    const pRing = mean(p, ring);
    // Edges inside it in the painting: a thing has some, a floor painted over it few.
    let strong = 0;
    for (const k of inside) {
      const x = k % w;
      if (x < 1 || x >= w - 1 || k < w || k >= n - w) continue;
      if (Math.hypot(lum(p, k + 1) - lum(p, k - 1), lum(p, k + w) - lum(p, k - w)) > 18) strong++;
    }
    const fault = { place: framePlace((b.x0 + b.x1) / 2 / w, (b.y0 + b.y1) / 2 / h), box: { x: b.x0 / w, y: b.y0 / h, w: bw / w, h: bh / h } };
    if (dist(pIn, pRing) < 12 && strong < inside.length * 0.04) lost.push(fault);
    // Turned to another thing: its tone far from the render's, and far from
    // what the painting's light did to the floor round it — the golden hour
    // warms and darkens a whole room, and its small pieces with it.
    else {
      const shift = (pRing[0]! + pRing[1]! + pRing[2]!) / 3 - (rRing[0]! + rRing[1]! + rRing[2]!) / 3;
      const moved = (pIn[0]! + pIn[1]! + pIn[2]!) / 3 - (rIn[0]! + rIn[1]! + rIn[2]!) / 3;
      if (inside.length >= n * 0.0004 && Math.abs(moved - shift) > 60) changed.push(fault);
    }
  }
  // A piece the render does not stand: on a floor — a surface of the render
  // bigger than any piece — a compact patch of the painting off the floor's
  // own tone. An armchair and a coffee table painted round a sheet's one sofa
  // held every piece of the render and passed (12/10/2026).
  const added: LocalFault[] = [];
  const floors = new Set<number>();
  // Not a lawn: a tree the sheet plants, and its shade, fall on the grass.
  const greenish = (id: number) => {
    const k = label.indexOf(id);
    return r[k * 3 + 1]! > r[k * 3]! + 8 && r[k * 3 + 1]! > r[k * 3 + 2]! + 8;
  };
  for (let id = 0; id < sizes.length; id++) if (sizes[id]! > n * 0.012 && id !== surfaces.sky && !greenish(id)) floors.add(id);
  for (const id of floors) {
    const ks: number[] = [];
    for (let k = 0; k < n; k++) {
      if (label[k] !== id) continue;
      const x = k % w;
      // Away from the surface's seams: a painting's lines wander a few pixels.
      if (x < 4 || x >= w - 4 || k < 4 * w || k >= n - 4 * w) continue;
      if (label[k - 4]! !== id || label[k + 4]! !== id || label[k - 4 * w]! !== id || label[k + 4 * w]! !== id) continue;
      if (!inHouse[k]) continue;
      ks.push(k);
    }
    if (ks.length < 200) continue;
    // The floor's own colour: the median of each channel over it.
    const med = [0, 1, 2].map((c) => ks.map((k) => p[k * 3 + c]!).sort((a, b) => a - b)[ks.length >> 1]!);
    const off = new Uint8Array(n);
    for (const k of ks) if (Math.hypot(p[k * 3]! - med[0]!, p[k * 3 + 1]! - med[1]!, p[k * 3 + 2]! - med[2]!) > 38) off[k] = 1;
    const seen = new Uint8Array(n);
    for (const start of ks) {
      if (!off[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      let [x0, y0, x1, y1, size] = [w, h, 0, 0, 0];
      while (stack.length) {
        const k = stack.pop()!;
        size++;
        const x = k % w;
        const y = (k - x) / w;
        [x0, y0, x1, y1] = [Math.min(x0, x), Math.min(y0, y), Math.max(x1, x), Math.max(y1, y)];
        for (const q of [k - 1, k + 1, k - w, k + w]) if (q >= 0 && q < n && off[q] && !seen[q]) (seen[q] = 1), stack.push(q);
      }
      const [bw, bh] = [x1 - x0 + 1, y1 - y0 + 1];
      if (size < n * 0.0004 || size < 0.5 * bw * bh || Math.max(bw, bh) > 4 * Math.min(bw, bh)) continue;
      // A thing has a crisp edge round it; the sun's light and a wall's shade on the floor fade.
      let crisp = 0;
      let rim = 0;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const k = y * w + x;
          if (!off[k] || x < 1 || x >= w - 1 || y < 1 || y >= h - 1) continue;
          if (off[k - 1] && off[k + 1] && off[k - w] && off[k + w]) continue;
          rim++;
          if (Math.hypot(lum(p, k + 1) - lum(p, k - 1), lum(p, k + w) - lum(p, k - w)) > 30) crisp++;
        }
      }
      if (rim === 0 || crisp < rim * 0.35) continue;
      // Sunlight through a window: the floor itself, brighter, its tint kept.
      const pm = [0, 0, 0];
      let pc = 0;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (off[y * w + x]) {
        for (let c = 0; c < 3; c++) pm[c] = pm[c]! + p[(y * w + x) * 3 + c]!;
        pc++;
      }
      const [pr, pg, pb] = pm.map((v) => v / Math.max(1, pc)) as [number, number, number];
      const tint = (a: number, b2: number, c: number) => [a / (a + b2 + c + 1), b2 / (a + b2 + c + 1)];
      const [t1, t2] = [tint(pr, pg, pb), tint(med[0]!, med[1]!, med[2]!)];
      if (pr + pg + pb > med[0]! + med[1]! + med[2]! && Math.hypot(t1[0]! - t2[0]!, t1[1]! - t2[1]!) < 0.04) continue;
      added.push({ place: framePlace((x0 + x1) / 2 / w, (y0 + y1) / 2 / h), box: { x: x0 / w, y: y0 / h, w: bw / w, h: bh / h } });
    }
  }
  return { lost, changed, added, pieces };
}

/**
 * The local checks over one painting, and what they found in words — null
 * where it holds. `railings: false` for a view straight down, where a railing
 * is its top rail and has no bars to count.
 */
export async function localMatch(
  render: Buffer,
  painting: Buffer,
  options?: { railings?: boolean },
): Promise<{ invented: LocalFault[]; lost: LocalFault[]; railings: LocalFault[]; reason: string | null }> {
  const surfaces = await surfacesOf(render);
  const [invented, lost, railings] = await Promise.all([
    inventedObjects(render, painting, surfaces),
    lostStructure(render, painting, surfaces),
    options?.railings === false ? Promise.resolve([]) : addedRailings(render, painting),
  ]);
  const places = (faults: LocalFault[]) => [...new Set(faults.map((f) => f.place))].join(", ");
  const reason = [
    ...(invented.length ? [`invented object at ${places(invented)}`] : []),
    ...(railings.length ? [`added railing at ${places(railings)}`] : []),
    ...(lost.length ? [`lost structure at ${places(lost)}`] : []),
  ].join("; ");
  return { invented, lost, railings, reason: reason || null };
}
