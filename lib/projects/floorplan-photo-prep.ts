import sharp from "sharp";
import {
  inferRoomKind,
  isStorageOrServiceRoom,
  isStudyRoom,
  type FloorplanBbox,
  type FloorplanRoom,
} from "@/lib/projects/floorplan-layout";

const RASTER = /^image\//i;
const MAX_LONG_EDGE = 4096;
const MIN_SHORT_EDGE = 1600;
const TARGET_SHORT_EDGE = 2400;

export type PreparedFloorplanSource = {
  base64: string;
  mimeType: string;
  sourceKind: "pdf" | "photo" | "drawing";
};

export function isRasterFloorplanMime(mime: string): boolean {
  return RASTER.test(mime) && !/svg/i.test(mime);
}

export function floorplanSourceFileName(mimeType: string): string {
  if (mimeType === "application/pdf") return "floorplan.pdf";
  if (mimeType.includes("png")) return "floorplan.png";
  if (mimeType.includes("webp")) return "floorplan.webp";
  return "floorplan.jpg";
}

/** כש-Windows שולח type ריק והקובץ בכל זאת תמונה / PDF */
export function sniffFloorplanMime(base64: string, mimeType: string): string {
  const mime = mimeType.trim();
  if (mime && mime !== "application/octet-stream") return mime;
  try {
    const buf = Buffer.from(base64.slice(0, 48), "base64");
    if (buf.slice(0, 4).toString("latin1") === "%PDF") return "application/pdf";
    if (buf[0] === 0xff && buf[1] === 0xd8) return "image/jpeg";
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
    if (buf.slice(0, 4).toString("latin1") === "RIFF" && buf.slice(8, 12).toString("latin1") === "WEBP") {
      return "image/webp";
    }
  } catch {
    /* ignore */
  }
  return mime || "application/pdf";
}

export function paperPixelRatio(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  threshold = 140,
): number {
  if (width < 8 || height < 8 || grey.length < width * height) return 0;
  let count = 0;
  const n = width * height;
  for (let i = 0; i < n; i++) {
    if ((grey[i] ?? 0) >= threshold) count++;
  }
  return count / n;
}

export function detectPaperCropBox(
  width: number,
  height: number,
  grey: Uint8Array | Buffer,
  threshold = 140,
): { left: number; top: number; width: number; height: number } | null {
  if (width < 8 || height < 8 || grey.length < width * height) return null;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let count = 0;
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if ((grey[row + x] ?? 0) >= threshold) {
        count++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  const paperRatio = count / (width * height);
  if (paperRatio < 0.18 || paperRatio > 0.97) return null;
  const padX = Math.max(2, Math.round(width * 0.02));
  const padY = Math.max(2, Math.round(height * 0.02));
  const left = Math.max(0, minX - padX);
  const top = Math.max(0, minY - padY);
  const right = Math.min(width - 1, maxX + padX);
  const bottom = Math.min(height - 1, maxY + padY);
  const cropW = right - left + 1;
  const cropH = bottom - top + 1;
  if (cropW < width * 0.45 || cropH < height * 0.45) return null;
  if (cropW >= width * 0.98 && cropH >= height * 0.98) return null;
  return { left, top, width: cropW, height: cropH };
}

/**
 * מיישר EXIF, מגביר ניגודיות בצל, ומגדיל צילום טלפון קטן — כדי ש-OCR יקרא תוכנית מודפסת.
 */
export async function prepareFloorplanSource(
  base64: string,
  mimeType: string,
  options?: { forceDrawing?: boolean },
): Promise<PreparedFloorplanSource> {
  const mime = sniffFloorplanMime(base64, mimeType);
  if (mime === "application/pdf" || !isRasterFloorplanMime(mime)) {
    return { base64, mimeType: mime, sourceKind: "pdf" };
  }

  try {
    const input = Buffer.from(base64, "base64");
    const rotated = await sharp(input, { failOn: "none", unlimited: true }).rotate().toBuffer();
    const preview = await sharp(rotated)
      .greyscale()
      .resize(800, 800, { fit: "inside" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const ratio = paperPixelRatio(preview.info.width, preview.info.height, preview.data);
    const asDrawing = options?.forceDrawing === true || ratio >= 0.88;
    const previewBox = asDrawing ? null : detectPaperCropBox(preview.info.width, preview.info.height, preview.data);
    let working = rotated;
    if (previewBox) {
      const rotMeta = await sharp(rotated).metadata();
      const sx = (rotMeta.width ?? preview.info.width) / preview.info.width;
      const sy = (rotMeta.height ?? preview.info.height) / preview.info.height;
      const fullW = rotMeta.width ?? preview.info.width;
      const fullH = rotMeta.height ?? preview.info.height;
      const left = Math.max(0, Math.min(fullW - 1, Math.round(previewBox.left * sx)));
      const top = Math.max(0, Math.min(fullH - 1, Math.round(previewBox.top * sy)));
      const width = Math.max(8, Math.min(fullW - left, Math.round(previewBox.width * sx)));
      const height = Math.max(8, Math.min(fullH - top, Math.round(previewBox.height * sy)));
      working = await sharp(rotated).extract({ left, top, width, height }).toBuffer();
    }

    const meta = await sharp(working).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const shortEdge = Math.min(width, height);
    const longEdge = Math.max(width, height);

    let pipeline = sharp(working, { failOn: "none", unlimited: true });

    if (shortEdge > 0 && shortEdge < MIN_SHORT_EDGE) {
      const scale = TARGET_SHORT_EDGE / shortEdge;
      const nextW = Math.round(width * scale);
      const nextH = Math.round(height * scale);
      const longest = Math.max(nextW, nextH);
      const clamp = longest > MAX_LONG_EDGE ? MAX_LONG_EDGE / longest : 1;
      pipeline = pipeline.resize(Math.round(nextW * clamp), Math.round(nextH * clamp), {
        kernel: "lanczos3",
        withoutEnlargement: false,
      });
    } else if (longEdge > MAX_LONG_EDGE) {
      pipeline = pipeline.resize(MAX_LONG_EDGE, MAX_LONG_EDGE, {
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    if (!asDrawing) {
      pipeline = pipeline.normalize().modulate({ brightness: 1.06, saturation: 0.92 }).sharpen({ sigma: 0.8 });
    }

    const out = await pipeline.jpeg({ quality: asDrawing ? 92 : 90, mozjpeg: true }).toBuffer();

    return {
      base64: out.toString("base64"),
      mimeType: "image/jpeg",
      sourceKind: asDrawing ? "drawing" : "photo",
    };
  } catch {
    return { base64, mimeType: mime, sourceKind: options?.forceDrawing ? "drawing" : "photo" };
  }
}

export async function isPortraitFloorplanRaster(base64: string, mimeType: string): Promise<boolean> {
  if (!isRasterFloorplanMime(mimeType)) return false;
  try {
    const meta = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    return height > width * 1.12;
  } catch {
    return false;
  }
}

/** חיתוך בלוק כותרות / איחוד חללים לפני סינתזת תלת־ממד */
export async function cropFloorplanRasterToUnit(
  base64: string,
  mimeType: string,
  bbox: FloorplanBbox,
): Promise<{ base64: string; mimeType: string } | null> {
  if (!isRasterFloorplanMime(mimeType)) return null;
  if (bbox.w >= 0.97 && bbox.h >= 0.97 && bbox.x <= 0.02 && bbox.y <= 0.02) {
    return { base64, mimeType };
  }
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const fullW = meta.width ?? 0;
    const fullH = meta.height ?? 0;
    if (fullW < 16 || fullH < 16) return null;
    const left = Math.max(0, Math.min(fullW - 8, Math.round(bbox.x * fullW)));
    const top = Math.max(0, Math.min(fullH - 8, Math.round(bbox.y * fullH)));
    const width = Math.max(8, Math.min(fullW - left, Math.round(bbox.w * fullW)));
    const height = Math.max(8, Math.min(fullH - top, Math.round(bbox.h * fullH)));
    const out = await sharp(input)
      .extract({ left, top, width, height })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return { base64: out.toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return null;
  }
}

/** קווי קיר שחור/לבן — מטשטש ריהוט דק, משאיר קירות עבים מהשרטוט */
export async function buildInkWallJpeg(base64: string): Promise<string | null> {
  try {
    const out = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true })
      .greyscale()
      .normalize()
      .threshold(150)
      .blur(1.2)
      .threshold(70)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

const MASSING_FILL: Record<string, string> = {
  living: "#eab308",
  kitchen: "#ea580c",
  bedroom: "#2563eb",
  mmd: "#4b5563",
  bathroom: "#06b6d4",
  balcony: "#4ade80",
  circulation: "#d1d5db",
  utility: "#7c3aed",
  other: "#64748b",
};

function massingRole(room: Pick<FloorplanRoom, "name" | "kind">): string {
  if (isStudyRoom(room as FloorplanRoom)) return "office";
  if (isStorageOrServiceRoom(room as FloorplanRoom)) return "storage";
  return room.kind ?? inferRoomKind(room.name);
}

function massingFill(room: Pick<FloorplanRoom, "name" | "kind">): string {
  const role = massingRole(room);
  if (role === "office") return "#059669";
  if (role === "storage") return "#7c3aed";
  if (role === "stair") return "#9ca3af";
  return MASSING_FILL[role] ?? "#94a3b8";
}

/**
 * שכבת צבע שקופה על השרטוט עצמו — רמז לסוג חלל, בלי מספרים ובלי להחליף קירות.
 */
export async function buildRoomMassingJpeg(
  base64: string,
  rooms: Array<Pick<FloorplanRoom, "name" | "kind" | "bbox">>,
): Promise<string | null> {
  const boxes = rooms
    .map((room) => ({ fill: massingFill(room), bbox: room.bbox }))
    .filter((row): row is { fill: string; bbox: FloorplanBbox } => row.bbox != null);
  if (boxes.length === 0) return null;
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 32 || height < 32) return null;
    const stroke = Math.max(2, Math.round(width / 500));
    const marks = boxes
      .map(({ fill, bbox }) => {
        const x = Math.round(bbox.x * width);
        const y = Math.round(bbox.y * height);
        const w = Math.max(10, Math.round(bbox.w * width));
        const h = Math.max(10, Math.round(bbox.h * height));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" fill-opacity="0.22" stroke="${fill}" stroke-opacity="0.55" stroke-width="${stroke}"/>`;
      })
      .join("");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`;
    const out = await sharp(input)
      .composite([{ input: Buffer.from(svg), blend: "over" }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** מספרי חללים על התוכנית — בלי שמות בעברית, כדי שההדמיה לא תצייר תוויות */
export async function buildRoomIndexOverlayJpeg(
  base64: string,
  rooms: Array<{ bbox?: FloorplanBbox }>,
): Promise<string | null> {
  const boxes = rooms
    .map((room, i) => ({ n: i + 1, bbox: room.bbox }))
    .filter((row): row is { n: number; bbox: FloorplanBbox } => row.bbox != null);
  if (boxes.length === 0) return null;
  try {
    const input = Buffer.from(base64, "base64");
    const meta = await sharp(input, { failOn: "none", unlimited: true }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (width < 32 || height < 32) return null;
    const marks = boxes
      .map(({ n, bbox }) => {
        const x = Math.round(bbox.x * width);
        const y = Math.round(bbox.y * height);
        const w = Math.max(12, Math.round(bbox.w * width));
        const h = Math.max(12, Math.round(bbox.h * height));
        const cx = x + Math.min(18, Math.round(w / 2));
        const cy = y + Math.min(18, Math.round(h / 2));
        return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="rgba(220,38,38,0.10)" stroke="#dc2626" stroke-width="${Math.max(2, Math.round(width / 700))}"/>
<circle cx="${cx}" cy="${cy}" r="13" fill="#dc2626"/>
<text x="${cx}" y="${cy + 5}" text-anchor="middle" font-size="15" font-family="Arial,sans-serif" font-weight="700" fill="#fff">${n}</text>`;
      })
      .join("");
    const svg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">${marks}</svg>`;
    const out = await sharp(input)
      .composite([{ input: Buffer.from(svg), blend: "over" }])
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

/** שרטוט קווים (קירות שחור/לבן) מול תמונת ריהוט / תלת־ממד */
export async function isMostlyLineDrawing(base64: string): Promise<boolean> {
  try {
    const { data } = await sharp(Buffer.from(base64, "base64"), { failOn: "none", unlimited: true })
      .greyscale()
      .resize(96, 96, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });
    let extreme = 0;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] ?? 128;
      if (v < 45 || v > 210) extreme++;
    }
    return data.length > 0 && extreme / data.length >= 0.58;
  } catch {
    return false;
  }
}

/**
 * A filled outline of the flat, for a sheet with no vectors to trace.
 *
 * On a scan the audit's standing complaint is the footprint: the render comes
 * back as a plain rectangle where the drawing steps in and out. Pulling the
 * individual walls out of a raster failed twice, but the outline is a much
 * easier target — dilate the ink until the drawing closes into one blob, keep
 * the largest, and fill it. The result is not a wall diagram and does not try
 * to be; it is the shape the flat has to end up.
 */
export async function buildFootprintSilhouetteJpeg(base64: string): Promise<string | null> {
  try {
    const src = Buffer.from(base64, "base64");
    const meta = await sharp(src, { failOn: "none", unlimited: true }).metadata();
    if (!meta.width || !meta.height) return null;
    // The silhouette needs no detail, and the dilation below is O(r²) per pixel.
    const width = Math.max(160, Math.min(460, Math.round(meta.width * 0.35)));
    const { data, info } = await sharp(src, { failOn: "none", unlimited: true })
      .greyscale()
      .resize({ width })
      .blur(2)
      .threshold(190)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const W = info.width;
    const H = info.height;
    const R = Math.max(6, Math.round(W * 0.029));
    const grown = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if ((data[y * W + x] ?? 255) >= 128) continue;
        for (let dy = -R; dy <= R; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= H) continue;
          for (let dx = -R; dx <= R; dx++) {
            const nx = x + dx;
            if (nx >= 0 && nx < W) grown[ny * W + nx] = 1;
          }
        }
      }
    }

    const seen = new Uint8Array(W * H);
    let best: { size: number; cells: number[] } | null = null;
    for (let start = 0; start < W * H; start++) {
      if (!grown[start] || seen[start]) continue;
      const stack = [start];
      seen[start] = 1;
      const cells: number[] = [];
      while (stack.length > 0) {
        const i = stack.pop()!;
        cells.push(i);
        const x = i % W;
        const y = (i - x) / W;
        if (x > 0 && grown[i - 1] && !seen[i - 1]) { seen[i - 1] = 1; stack.push(i - 1); }
        if (x < W - 1 && grown[i + 1] && !seen[i + 1]) { seen[i + 1] = 1; stack.push(i + 1); }
        if (y > 0 && grown[i - W] && !seen[i - W]) { seen[i - W] = 1; stack.push(i - W); }
        if (y < H - 1 && grown[i + W] && !seen[i + W]) { seen[i + W] = 1; stack.push(i + W); }
      }
      if (!best || cells.length > best.size) best = { size: cells.length, cells };
    }
    // A blob that is nearly the whole page has merged the title block and the
    // dimension chains into the flat, and says nothing useful.
    if (!best || best.size < W * H * 0.05 || best.size > W * H * 0.8) return null;

    const blob = new Uint8Array(W * H);
    for (const i of best.cells) blob[i] = 1;
    const outside = new Uint8Array(W * H);
    const stack: number[] = [];
    for (let x = 0; x < W; x++) { stack.push(x); stack.push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { stack.push(y * W); stack.push(y * W + W - 1); }
    while (stack.length > 0) {
      const i = stack.pop()!;
      if (outside[i] || blob[i]) continue;
      outside[i] = 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x > 0) stack.push(i - 1);
      if (x < W - 1) stack.push(i + 1);
      if (y > 0) stack.push(i - W);
      if (y < H - 1) stack.push(i + W);
    }

    // The fill is only a footprint if the outline actually closed. Where a
    // window or a terrace opening leaves a gap the dilation cannot bridge, the
    // outside flood walks straight into the flat and what survives is the
    // dilated ink skeleton — a Rorschach blot that tells the image model less
    // than nothing. Measure the fill against its own bounding box and refuse it
    // when it is plainly not a solid shape.
    let filled = 0;
    let minX = W;
    let maxX = -1;
    let minY = H;
    let maxY = -1;
    for (let i = 0; i < W * H; i++) {
      if (outside[i]) continue;
      filled += 1;
      const x = i % W;
      const y = (i - x) / W;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const boxArea = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1));
    if (filled / boxArea < 0.45) return null;

    const rgb = new Uint8Array(W * H * 3).fill(255);
    for (let i = 0; i < W * H; i++) {
      if (outside[i]) continue;
      rgb[i * 3] = 40;
      rgb[i * 3 + 1] = 44;
      rgb[i * 3 + 2] = 48;
    }
    const out = await sharp(Buffer.from(rgb), { raw: { width: W, height: H, channels: 3 } })
      .resize({ width: 1000 })
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}
