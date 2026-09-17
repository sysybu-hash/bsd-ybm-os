import { createLogger } from "@/lib/logger";
import {
  CANVAS_FONT_BOLD,
  registerCanvasFonts,
} from "@/lib/projects/floorplan-canvas-fonts";
import type { FloorplanLayout, FloorplanRoom } from "@/lib/projects/floorplan-layout";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";

const log = createLogger("floorplan-plan-guide");

/**
 * The sheet with every room named on top of it, at the position it was read.
 *
 * The prompt has always carried the room list and a paragraph forbidding a
 * mirrored plate. Words did not hold: on a sheet whose labels are drawn as
 * outlines the model read no Hebrew at all, and it produced a flat with the
 * kitchen and the living room swapped sides and the shelter room replaced by
 * a corridor. The extractor knows where each room is — that is what a bbox is
 * — so the cheapest way to tell the image model is to write it on the picture
 * it is already copying.
 */

export type PlanGuide = {
  mimeType: "image/jpeg";
  base64: string;
  /** The rooms drawn on it, in the order they are numbered. */
  labels: Array<{ index: number; name: string }>;
};

/**
 * The span the placed rooms cover, which is the flat — not the sheet.
 *
 * A bbox is a fraction of the whole page, margins and title block included,
 * so a flat drawn in the middle of an A4 sheet has every room reading as
 * "centre" against absolute thresholds.
 */
export function placedRoomsExtent(
  rooms: FloorplanRoom[],
): { x: number; y: number; w: number; h: number } | null {
  const boxes = rooms.map((room) => room.bbox).filter((box): box is NonNullable<typeof box> => box != null);
  if (boxes.length === 0) return null;
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  const right = Math.max(...boxes.map((b) => b.x + b.w));
  const bottom = Math.max(...boxes.map((b) => b.y + b.h));
  return { x, y, w: Math.max(1e-6, right - x), h: Math.max(1e-6, bottom - y) };
}

/** Ninth of the flat a room sits in, for the text half of the same brief. */
export function planPositionLabel(
  room: FloorplanRoom,
  extent?: { x: number; y: number; w: number; h: number } | null,
): string | null {
  const box = room.bbox;
  if (!box) return null;
  const frame = extent ?? { x: 0, y: 0, w: 1, h: 1 };
  const cx = (box.x + box.w / 2 - frame.x) / frame.w;
  const cy = (box.y + box.h / 2 - frame.y) / frame.h;
  const col = cx < 0.37 ? "left" : cx > 0.63 ? "right" : "centre";
  const row = cy < 0.37 ? "top" : cy > 0.63 ? "bottom" : "middle";
  return col === "centre" && row === "middle" ? "centre" : `${row}-${col}`;
}

function planRoomsWithBox(layout: FloorplanLayout): FloorplanRoom[] {
  return layout.rooms.filter((room) => room.bbox != null);
}

/**
 * True when the layout knows where its rooms are well enough to draw a guide.
 * A handful of boxes on a thirteen-room flat would label some rooms and leave
 * the model free on the rest, which is worse than labelling none.
 */
export function layoutCanGuide(layout: FloorplanLayout): boolean {
  const withBox = planRoomsWithBox(layout).length;
  return layout.rooms.length >= 3 && withBox >= Math.ceil(layout.rooms.length * 0.7);
}

export async function buildLabelledPlanJpeg(
  plan: { base64: string; mimeType: string },
  layout: FloorplanLayout,
  width = 1400,
): Promise<PlanGuide | null> {
  const rooms = planRoomsWithBox(layout);
  if (rooms.length === 0) return null;
  try {
    const { createCanvas, GlobalFonts, loadImage } = await import("@napi-rs/canvas");
    registerCanvasFonts(GlobalFonts);

    let sheet: Buffer;
    if (plan.mimeType === "application/pdf") {
      const jpeg = await rasterizePdfPageJpeg(Buffer.from(plan.base64, "base64"), width);
      if (!jpeg) return null;
      sheet = Buffer.from(jpeg, "base64");
    } else {
      sheet = Buffer.from(plan.base64, "base64");
    }

    const image = await loadImage(sheet);
    const scale = width / image.width;
    const height = Math.round(image.height * scale);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0, width, height);

    const labels: PlanGuide["labels"] = [];
    rooms.forEach((room, i) => {
      const box = room.bbox!;
      const x = box.x * width;
      const y = box.y * height;
      const w = Math.max(24, box.w * width);
      const h = Math.max(24, box.h * height);
      const index = i + 1;
      labels.push({ index, name: room.name });

      ctx.strokeStyle = "rgba(214, 31, 105, 0.9)";
      ctx.lineWidth = Math.max(2, width * 0.0025);
      ctx.strokeRect(x, y, w, h);

      const size = Math.max(16, Math.round(width * 0.018));
      ctx.font = `bold ${size}px ${CANVAS_FONT_BOLD}`;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = `${index}. ${room.name}`;
      const chipW = ctx.measureText(text).width + size;
      const chipH = size * 1.7;
      const cx = x + w / 2;
      const cy = y + h / 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.86)";
      ctx.fillRect(cx - chipW / 2, cy - chipH / 2, chipW, chipH);
      ctx.strokeStyle = "rgba(214, 31, 105, 0.9)";
      ctx.lineWidth = Math.max(1, width * 0.0012);
      ctx.strokeRect(cx - chipW / 2, cy - chipH / 2, chipW, chipH);
      ctx.fillStyle = "#b0145a";
      ctx.fillText(text, cx, cy);
    });

    const out = canvas.toBuffer("image/jpeg", 92);
    return { mimeType: "image/jpeg", base64: Buffer.from(out).toString("base64"), labels };
  } catch (err: unknown) {
    log.warn("labelled plan guide failed; generating without it", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
