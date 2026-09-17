import { createLogger } from "@/lib/logger";
import {
  inferRoomKind,
  type FloorplanLayout,
  type FloorplanRoom,
  type FloorplanRoomKind,
} from "@/lib/projects/floorplan-layout";
import { layoutCanGuide, placedRoomsExtent } from "@/lib/projects/floorplan-plan-guide";

const log = createLogger("floorplan-schematic-plate");

/**
 * A plate of the flat, drawn from where the rooms were read.
 *
 * The measured route works because the image model is handed a picture of this
 * apartment and asked to photograph it, rather than a drawing and asked to
 * understand it. That route needs wall geometry, and on a plotted CAD sheet
 * the reader cannot yet produce it.
 *
 * The extractor can, though, say where each room is and what is in it, and it
 * does that well: thirteen rooms on 28-8-23-2, each within a few per cent of
 * its printed position. This turns that into the same kind of plate — rooms as
 * rectangles, walls between them, a bed where the sheet counts a bed. It is
 * schematic where the measured plate is exact, and the rooms it draws are the
 * rooms the sheet has, in the places the sheet puts them, which is the part
 * the stills kept getting wrong.
 */

const WALL = "#e8e2d6";
const WALL_EDGE = "#cfc7b8";
const OUTSIDE = "#f4efe6";

const FLOOR: Record<FloorplanRoomKind, string> = {
  living: "#c89a62",
  kitchen: "#d9cdb8",
  bedroom: "#c08f57",
  bathroom: "#d8d6d0",
  mmd: "#bfa886",
  balcony: "#d6cfc2",
  utility: "#d3cfc6",
  circulation: "#c89a62",
  other: "#c6b79b",
};

type Box = { x: number; y: number; w: number; h: number };

/** Edges within a hair of each other are the same wall; snapping closes the gaps. */
function snapEdges(values: number[], tolerance: number): Map<number, number> {
  const sorted = [...values].sort((a, b) => a - b);
  const out = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const mean = group.reduce((sum, v) => sum + v, 0) / group.length;
    for (const v of group) out.set(v, mean);
    group = [];
  };
  for (const v of sorted) {
    if (group.length > 0 && v - group[0]! > tolerance) flush();
    group.push(v);
  }
  flush();
  return out;
}

function roomKindOf(room: FloorplanRoom): FloorplanRoomKind {
  return room.kind ?? inferRoomKind(room.name);
}

function furnitureFor(kind: FloorplanRoomKind, room: FloorplanRoom, box: Box): string {
  const pad = Math.min(box.w, box.h) * 0.12;
  const piece = (x: number, y: number, w: number, h: number, fill: string) =>
    `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(2, w).toFixed(1)}" height="${Math.max(2, h).toFixed(1)}" rx="${(Math.min(w, h) * 0.08).toFixed(1)}" fill="${fill}" stroke="#a89madd" stroke-width="0"/>`
      .replace("#a89madd", "#a8967a");
  const out: string[] = [];
  const beds = room.bedCount ?? (kind === "bedroom" ? 1 : 0);

  if (kind === "bedroom" || (kind === "mmd" && beds > 0)) {
    const bedW = Math.min(box.w * 0.42, box.h * 0.42);
    for (let i = 0; i < Math.min(beds, 2); i++) {
      out.push(
        piece(
          box.x + pad + i * (bedW + pad * 0.6),
          box.y + box.h - pad - bedW * 1.5,
          bedW,
          bedW * 1.5,
          "#efe7db",
        ),
      );
    }
    if ((room.deskCount ?? 0) > 0) {
      out.push(piece(box.x + box.w - pad - box.w * 0.3, box.y + pad, box.w * 0.3, box.h * 0.14, "#b98f5c"));
    }
  }
  if (kind === "living") {
    out.push(piece(box.x + pad, box.y + pad, box.w * 0.46, box.h * 0.3, "#efe7db"));
    out.push(piece(box.x + box.w * 0.5, box.y + box.h * 0.45, box.w * 0.4, box.h * 0.35, "#b98f5c"));
  }
  if (kind === "kitchen") {
    out.push(piece(box.x + pad, box.y + pad, box.w - pad * 2, box.h * 0.2, "#e4dccd"));
  }
  if (kind === "bathroom") {
    out.push(piece(box.x + pad, box.y + pad, box.w * 0.45, box.h * 0.35, "#eef2f4"));
    out.push(piece(box.x + box.w - pad - box.w * 0.22, box.y + box.h * 0.5, box.w * 0.22, box.h * 0.28, "#eef2f4"));
  }
  if (kind === "utility") {
    out.push(piece(box.x + pad, box.y + pad, box.w * 0.3, box.h * 0.35, "#eef2f4"));
  }
  return out.join("");
}

export type SchematicPlate = { mimeType: "image/jpeg"; base64: string };

export async function buildSchematicPlateJpeg(
  layout: FloorplanLayout,
  width = 1200,
): Promise<SchematicPlate | null> {
  if (!layoutCanGuide(layout)) return null;
  const rooms = layout.rooms.filter((room) => room.bbox != null);
  const extent = placedRoomsExtent(rooms);
  if (!extent) return null;

  try {
    const aspect = extent.h / extent.w;
    const height = Math.round(width * aspect);
    const margin = Math.round(width * 0.04);
    const innerW = width - margin * 2;
    const innerH = height - margin * 2;

    const tolerance = 0.02;
    const xs = snapEdges(rooms.flatMap((r) => [r.bbox!.x, r.bbox!.x + r.bbox!.w]), tolerance);
    const ys = snapEdges(rooms.flatMap((r) => [r.bbox!.y, r.bbox!.y + r.bbox!.h]), tolerance);
    const place = (room: FloorplanRoom): Box => {
      const b = room.bbox!;
      // Half a wall of growth in every direction, so neighbouring rooms meet
      // through one wall instead of leaving a stripe of nothing between them.
      const x0 = (xs.get(b.x) ?? b.x - extent.x) - extent.x;
      const x1 = (xs.get(b.x + b.w) ?? b.x + b.w) - extent.x;
      const y0 = (ys.get(b.y) ?? b.y) - extent.y;
      const y1 = (ys.get(b.y + b.h) ?? b.y + b.h) - extent.y;
      const grow = Math.max(2, width * 0.006);
      return {
        x: margin + (x0 / extent.w) * innerW - grow,
        y: margin + (y0 / extent.h) * innerH - grow,
        w: Math.max(6, ((x1 - x0) / extent.w) * innerW) + grow * 2,
        h: Math.max(6, ((y1 - y0) / extent.h) * innerH) + grow * 2,
      };
    };

    const wallWidth = Math.max(4, width * 0.009);
    const parts: string[] = [];
    const placed = rooms.map((room) => ({ room, box: place(room) }));

    // The envelope first, so every room sits inside one solid outline.
    const hull = placed.reduce(
      (acc, { box }) => ({
        x: Math.min(acc.x, box.x),
        y: Math.min(acc.y, box.y),
        r: Math.max(acc.r, box.x + box.w),
        b: Math.max(acc.b, box.y + box.h),
      }),
      { x: Infinity, y: Infinity, r: -Infinity, b: -Infinity },
    );
    // The flat's slab: an envelope wall, and circulation floor inside it. The
    // gaps between the rooms the extractor placed are the hall and the
    // corridors, and they have to read as floor, not as a metre of concrete.
    parts.push(
      `<rect x="${(hull.x - wallWidth * 2).toFixed(1)}" y="${(hull.y - wallWidth * 2).toFixed(1)}" width="${(hull.r - hull.x + wallWidth * 4).toFixed(1)}" height="${(hull.b - hull.y + wallWidth * 4).toFixed(1)}" fill="${WALL}" stroke="${WALL_EDGE}" stroke-width="2"/>`,
      `<rect x="${(hull.x - wallWidth * 0.5).toFixed(1)}" y="${(hull.y - wallWidth * 0.5).toFixed(1)}" width="${(hull.r - hull.x + wallWidth).toFixed(1)}" height="${(hull.b - hull.y + wallWidth).toFixed(1)}" fill="${FLOOR.circulation}"/>`,
    );

    for (const { room, box } of placed) {
      const kind = roomKindOf(room);
      if (kind === "balcony") continue;
      parts.push(
        `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" fill="${FLOOR[kind] ?? FLOOR.other}" stroke="${WALL}" stroke-width="${wallWidth.toFixed(1)}"/>`,
      );
    }
    // Terraces last and paler, so a balcony reads as outdoor paving.
    for (const { room, box } of placed) {
      if (roomKindOf(room) !== "balcony") continue;
      parts.push(
        `<rect x="${box.x.toFixed(1)}" y="${box.y.toFixed(1)}" width="${box.w.toFixed(1)}" height="${box.h.toFixed(1)}" fill="${FLOOR.balcony}" stroke="${WALL}" stroke-width="${(wallWidth * 0.6).toFixed(1)}"/>`,
      );
    }
    for (const { room, box } of placed) {
      parts.push(furnitureFor(roomKindOf(room), room, box));
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="${OUTSIDE}"/>${parts.join("")}</svg>`;
    const sharp = (await import("sharp")).default;
    const jpeg = await sharp(Buffer.from(svg), { density: 200 })
      // density scales the render up; the plate is sent at the size asked for.
      .resize({ width, withoutEnlargement: false })
      .flatten({ background: OUTSIDE })
      .jpeg({ quality: 92 })
      .toBuffer();
    return { mimeType: "image/jpeg", base64: jpeg.toString("base64") };
  } catch (err: unknown) {
    log.warn("schematic plate failed; generating without it", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
