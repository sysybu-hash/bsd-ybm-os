import { createLogger } from "@/lib/logger";
import {
  CANVAS_FONT_BOLD,
  registerCanvasFonts,
} from "@/lib/projects/floorplan-canvas-fonts";
import {
  inferRoomKind,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanRoomKind,
} from "@/lib/projects/floorplan-layout";
import { layoutCanGuide, placedRoomsExtent } from "@/lib/projects/floorplan-plan-guide";
import { rasterizePdfPageJpeg } from "@/lib/projects/floorplan-raster-page";

const log = createLogger("floorplan-tinted-plan");

/**
 * The sheet itself, tinted by room — the reference a still is copied from.
 *
 * Everything before this tried to give the image model a reconstruction: walls
 * rebuilt from the vectors, or rooms drawn as rectangles from the extractor's
 * boxes. Both are approximations of a drawing that is already exact, and every
 * gap in the reconstruction came back as an invented room. The walls, the
 * jogs, the fixtures and the furniture symbols are all in the sheet, drawn by
 * the architect, and a raster of it is a perfect record of them.
 *
 * What the sheet does not carry, for a model reading it cold, is which space
 * is which — the labels are drawn as outlines here, unreadable as text. That
 * the extractor knows, and it is the one thing this adds: a translucent wash
 * per room in a colour that says what the room is for, and its name beside it.
 * The ink stays visible through the wash, because the ink is the part that
 * must be copied exactly.
 */

export type TintedPlan = {
  mimeType: "image/jpeg";
  base64: string;
  rooms: number;
};

/** Washes, not paint: every one of these sits over black ink that must read through. */
const TINT: Record<FloorplanRoomKind, string> = {
  living: "rgba(232,164,74,0.22)",
  kitchen: "rgba(90,170,200,0.20)",
  bedroom: "rgba(150,120,200,0.20)",
  bathroom: "rgba(80,190,180,0.22)",
  mmd: "rgba(120,120,130,0.20)",
  balcony: "rgba(150,190,120,0.20)",
  utility: "rgba(190,150,110,0.20)",
  circulation: "rgba(210,190,150,0.16)",
  other: "rgba(200,170,120,0.18)",
};

function kindOf(room: FloorplanRoom): FloorplanRoomKind {
  return room.kind ?? inferRoomKind(room.name);
}

/**
 * A terrace is not a room and never reaches layout.rooms, so the wash left
 * the paved pockets blank and the crop could cut them off — and the model,
 * given a drawing that says nothing about them, put a terrace along דירה 21's
 * kitchen wall and lost the one in its corner. Measured, they wash like any
 * other space.
 */
export type TerraceBox = { x: number; y: number; w: number; h: number };

export async function buildTintedPlanJpeg(
  plan: { base64: string; mimeType: string },
  layout: FloorplanLayout,
  options?: { width?: number; terraces?: TerraceBox[] },
): Promise<TintedPlan | null> {
  if (!layoutCanGuide(layout)) return null;
  const rooms = layout.rooms.filter((room) => room.bbox != null);
  const terraces = options?.terraces ?? [];
  const extent = placedRoomsExtent([
    ...rooms,
    ...terraces.map((box) => ({ name: "מרפסת", bbox: box }) as FloorplanRoom),
  ]);
  if (!extent) return null;

  try {
    const width = options?.width ?? 1500;
    const { createCanvas, GlobalFonts, loadImage } = await import("@napi-rs/canvas");
    registerCanvasFonts(GlobalFonts);

    let sheet: Buffer;
    if (plan.mimeType === "application/pdf") {
      const jpeg = await rasterizePdfPageJpeg(Buffer.from(plan.base64, "base64"), width * 2);
      if (!jpeg) return null;
      sheet = Buffer.from(jpeg, "base64");
    } else {
      sheet = Buffer.from(plan.base64, "base64");
    }

    const image = await loadImage(sheet);
    // Crop to the flat, with a margin: the title block, the dimension chains
    // and the neighbouring drawing are not this apartment, and everything left
    // in the frame is something the model may copy.
    const margin = 0.03;
    const cropX = Math.max(0, (extent.x - margin) * image.width);
    const cropY = Math.max(0, (extent.y - margin) * image.height);
    const cropW = Math.min(image.width - cropX, (extent.w + margin * 2) * image.width);
    const cropH = Math.min(image.height - cropY, (extent.h + margin * 2) * image.height);
    if (!(cropW > 8) || !(cropH > 8)) return null;

    const scale = width / cropW;
    const height = Math.round(cropH * scale);
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, width, height);

    const place = (room: FloorplanRoom) => {
      const b = room.bbox!;
      return {
        x: (b.x * image.width - cropX) * scale,
        y: (b.y * image.height - cropY) * scale,
        w: b.w * image.width * scale,
        h: b.h * image.height * scale,
      };
    };

    for (const room of rooms) {
      const box = place(room);
      ctx.fillStyle = TINT[kindOf(room)] ?? TINT.other;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }
    for (const terrace of terraces) {
      const box = place({ name: "מרפסת", bbox: terrace } as FloorplanRoom);
      ctx.fillStyle = TINT.balcony;
      ctx.fillRect(box.x, box.y, box.w, box.h);
    }

    const size = Math.max(15, Math.round(width * 0.016));
    const labelled: FloorplanRoom[] = [
      ...rooms,
      ...terraces.map((box) => ({ name: "מרפסת", bbox: box }) as FloorplanRoom),
    ];
    labelled.forEach((room, i) => {
      const box = place(room);
      ctx.font = `bold ${size}px ${CANVAS_FONT_BOLD}`;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const text = `${i + 1}. ${room.name}`;
      const chipW = ctx.measureText(text).width + size * 0.8;
      const chipH = size * 1.5;
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.fillRect(cx - chipW / 2, cy - chipH / 2, chipW, chipH);
      ctx.fillStyle = "#7a2352";
      ctx.fillText(text, cx, cy);
    });

    const out = canvas.toBuffer("image/jpeg", 92);
    return { mimeType: "image/jpeg", base64: Buffer.from(out).toString("base64"), rooms: rooms.length };
  } catch (err: unknown) {
    log.warn("tinted plan failed; generating from the plain sheet", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
