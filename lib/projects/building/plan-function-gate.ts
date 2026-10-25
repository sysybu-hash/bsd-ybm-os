import sharp from "sharp";

import { askDrawing } from "@/lib/projects/building/house-ai";
import { planFrustumMetres, type PlanGeometryFloorMeta } from "@/lib/projects/building/plan-geometry-gate";

/**
 * Gate 2 — what stands in each room of a painted storey, against the measured
 * render of that room. The pixel judge (edges, masses) cannot tell a bed from a
 * sofa or a WC from a laundry: Gottlieb A's upper floor passed it with its
 * 3.80×3.55 bedroom furnished as a living room and its two WCs turned into
 * laundries (17/10/2026), because the piece-by-piece check had been switched
 * off (`furnishing: async () => null`). The render is the authority; a room's
 * painting may hold exactly the render's pieces, no other and none fewer.
 */
export const PLAN_PIECES = [
  "bed",
  "sofa",
  "coffee_table",
  "dining_table",
  "kitchen_run",
  "sink",
  "toilet",
  "bathtub_or_shower",
  "washing_machine",
  "wardrobe",
  "desk",
  "screen",
  "stair",
  "car",
] as const;

export type PlanPiece = (typeof PLAN_PIECES)[number];

export type PlanRoomBox = { kind: string; name?: string; x: number; z: number; w: number; d: number; areaM2?: number };

export type PlanFunctionFault = {
  room: string;
  kind: string;
  piece: PlanPiece;
  fault: "added" | "lost";
  render: number;
  painting: number;
  /** Where in the frame, in the fault list's words: "top-left", "middle", … */
  where: string;
};

export type PlanFunctionVerdict = { ok: boolean; faults: PlanFunctionFault[]; checked: number };

/** A room is crossed only when it is big enough to hold furniture. */
export const MIN_ROOM_M2 = 0.8;
/** Rooms a call: each is two images (the render's, the painting's). */
export const ROOMS_PER_CALL = 6;

type Counts = Partial<Record<PlanPiece, number>>;
export type PlanPieceAsk = (prompt: string, images: Buffer[]) => Promise<Record<string, unknown> | null>;

const where = (cx: number, cz: number, x0: number, z0: number, w: number, h: number): string => {
  const fx = (cx - x0) / w;
  const fz = (cz - z0) / h;
  const col = fx < 1 / 3 ? "left" : fx > 2 / 3 ? "right" : "";
  const row = fz < 1 / 3 ? "top" : fz > 2 / 3 ? "bottom" : "";
  return row && col ? `${row}-${col}` : row || col || "middle";
};

export function pieceCountPrompt(rooms: ReadonlyArray<{ index: number; kind: string }>): string {
  return [
    `You are given ${rooms.length} pairs of pictures, each pair one room of a house seen from straight above: first the measured render, then its photographic painting. The pairs come in order; pair numbers: ${rooms.map((r) => `${r.index} (${r.kind})`).join(", ")}.`,
    `For every picture count the pieces of these kinds only: ${PLAN_PIECES.join(", ")}.`,
    "bed = a mattress with a pillow end; sofa = a long upholstered seat with back and arms; coffee_table = a low table beside a sofa; dining_table = a table with chairs round it; kitchen_run = a worktop with sink or hob; sink = a basin or kitchen sink; toilet = a WC bowl; bathtub_or_shower = a bath or shower tray; washing_machine = a white box with a round door or dial; wardrobe = a tall cabinet or built-in closet; desk = a work table; screen = a television, monitor or laptop; stair = a flight of treads; car = a parked car. Count what is there, not what the room is for. A piece that is not clearly one of these is not counted.",
    'Answer JSON only: {"rooms": [{"pair": number, "render": {"bed": n, ...}, "painting": {"bed": n, ...}}]} — omit a kind that is zero.',
  ].join("\n");
}

function readCounts(v: unknown): Counts {
  const out: Counts = {};
  if (!v || typeof v !== "object") return out;
  for (const p of PLAN_PIECES) {
    const n = (v as Record<string, unknown>)[p];
    if (typeof n === "number" && Number.isFinite(n) && n > 0) out[p] = Math.round(n);
  }
  return out;
}

/** The faults between two counts of one room: any piece the painting added, and any it lost. */
export function compareCounts(render: Counts, painting: Counts): Array<{ piece: PlanPiece; fault: "added" | "lost"; render: number; painting: number }> {
  const out: Array<{ piece: PlanPiece; fault: "added" | "lost"; render: number; painting: number }> = [];
  for (const piece of PLAN_PIECES) {
    const r = render[piece] ?? 0;
    const p = painting[piece] ?? 0;
    if (p > r) out.push({ piece, fault: "added", render: r, painting: p });
    else if (p < r) out.push({ piece, fault: "lost", render: r, painting: p });
  }
  return out;
}

/**
 * Each room of the storey, rendered and painted, counted by the vision model
 * and compared: the painting holds where every room has the render's pieces.
 * A call that is not answered (no key, no budget) is not a pass: `ok` is false
 * and `checked` is the number of rooms that were read.
 */
export async function planFunctionFaults(input: {
  render: Buffer;
  painting: Buffer;
  rooms: readonly PlanRoomBox[];
  floor: PlanGeometryFloorMeta;
  padM: number;
  ask?: PlanPieceAsk;
}): Promise<PlanFunctionVerdict> {
  const ask = input.ask ?? askDrawing;
  const meta = await sharp(input.render).metadata();
  const W = meta.width ?? 0;
  const H = meta.height ?? 0;
  if (W < 100 || H < 100) throw new Error("plan too small to cross by room");
  const paintingFit = await sharp(input.painting).resize(W, H, { fit: "fill" }).jpeg({ quality: 92 }).toBuffer();
  const fr = planFrustumMetres(input.floor, input.padM);

  const rooms = input.rooms.filter((r) => (r.areaM2 ?? r.w * r.d) >= MIN_ROOM_M2 && r.kind !== "circulation");
  const crops: Array<{ room: PlanRoomBox; index: number; render: Buffer; painting: Buffer }> = [];
  for (const [i, room] of rooms.entries()) {
    const left = Math.max(0, Math.floor(((room.x - fr.x0) / fr.w) * W));
    const top = Math.max(0, Math.floor(((room.z - fr.z0) / fr.h) * H));
    const width = Math.min(W - left, Math.max(24, Math.ceil((room.w / fr.w) * W)));
    const height = Math.min(H - top, Math.max(24, Math.ceil((room.d / fr.h) * H)));
    if (width < 8 || height < 8) continue;
    const cut = (img: Buffer) => sharp(img).extract({ left, top, width, height }).resize({ width: 512, height: 512, fit: "inside" }).jpeg({ quality: 90 }).toBuffer();
    crops.push({ room, index: i + 1, render: await cut(input.render), painting: await cut(paintingFit) });
  }

  const faults: PlanFunctionFault[] = [];
  let checked = 0;
  for (let at = 0; at < crops.length; at += ROOMS_PER_CALL) {
    const batch = crops.slice(at, at + ROOMS_PER_CALL);
    const answer = await ask(pieceCountPrompt(batch.map((c) => ({ index: c.index, kind: c.room.kind }))), batch.flatMap((c) => [c.render, c.painting]));
    const rows = answer && Array.isArray(answer.rooms) ? (answer.rooms as unknown[]) : [];
    for (const c of batch) {
      const row = rows.find((r): r is Record<string, unknown> => !!r && typeof r === "object" && (r as Record<string, unknown>).pair === c.index);
      if (!row) continue;
      checked++;
      for (const f of compareCounts(readCounts(row.render), readCounts(row.painting))) {
        faults.push({
          room: c.room.name ?? c.room.kind,
          kind: c.room.kind,
          ...f,
          where: where(c.room.x + c.room.w / 2, c.room.z + c.room.d / 2, fr.x0, fr.z0, fr.w, fr.h),
        });
      }
    }
  }
  return { ok: checked === crops.length && faults.length === 0, faults, checked };
}

/** The faults in the words the painting's repair is told: "sofa added in a bedroom (render 0, painting 1)". */
export function planFunctionText(f: PlanFunctionFault): string {
  return `${f.piece.replace(/_/g, " ")} ${f.fault} in a ${f.kind} (render ${f.render}, painting ${f.painting})`;
}
