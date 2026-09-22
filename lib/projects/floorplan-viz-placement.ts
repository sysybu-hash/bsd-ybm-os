import { GoogleGenerativeAI } from "@google/generative-ai";

import { parseModelJsonText } from "@/lib/ai-document-json";
import { recordAiUsage, usageFromGemini } from "@/lib/ai-usage";
import { getGeminiApiKey } from "@/lib/gemini-api-key";
import {
  deterministicGenerationConfig,
  getFloorplanLayoutModelChain,
  isLikelyGeminiModelUnavailable,
} from "@/lib/gemini-model";
import { createLogger } from "@/lib/logger";
import { inferRoomKind, type FloorplanLayout, type FloorplanRoomKind } from "@/lib/projects/floorplan-layout";
import { placedRoomsExtent } from "@/lib/projects/floorplan-plan-guide";
import { recordAmbientFloorplanSpend } from "@/lib/projects/floorplan-spend";

const log = createLogger("floorplan-viz-placement");

/**
 * Is each room where the plan puts it?
 *
 * The auditor counts things — beds, screens, washers, stools — and a count
 * cannot see a room that moved. דירה 14's still put the kitchen where the plan
 * has a bedroom and a laundry nook where the plan has the entrance, and every
 * count that did not happen to lose a bedroom passed. This asks the other
 * question: for each room the plan places, what is at that place in the still.
 *
 * Rooms are compared by what they are for, not by name. An open-plan kitchen
 * and living room are one space on most of these sheets and are painted as
 * one, so they are one class; a ממ"ד furnished as a bedroom is a bedroom.
 */

export type PlacementClass = "sleeping" | "day" | "wet" | "outdoor";

/**
 * Balconies are not placed. Tried on דירה 14 against its own correct plate,
 * they were the only false alarms: a terrace is a thin strip whose box the
 * sheet read gives only roughly, the service balcony's box overlapped the bath,
 * and a pocket beside an unplaced kitchen landed on the kitchen. Terraces
 * already have their own checks — printed and missing, invented, grown.
 */
const CLASS_OF: Partial<Record<FloorplanRoomKind, PlacementClass>> = {
  bedroom: "sleeping",
  mmd: "sleeping",
  living: "day",
  kitchen: "day",
  bathroom: "wet",
};

const FOUND = ["bedroom", "living", "kitchen", "dining", "bathroom", "balcony", "laundry", "entrance", "corridor", "storage", "office", "empty", "unclear"] as const;
type Found = (typeof FOUND)[number];

const FOUND_CLASS: Partial<Record<Found, PlacementClass>> = {
  bedroom: "sleeping",
  living: "day",
  kitchen: "day",
  dining: "day",
  bathroom: "wet",
  balcony: "outdoor",
};

export type ExpectedRoom = {
  id: string;
  name: string;
  expected: PlacementClass;
  /** The room's box as fractions of the apartment's own outline, 0..1. */
  box: { x: number; y: number; w: number; h: number };
};

/** The rooms worth checking, placed against the flat itself rather than the page. */
export function expectedRoomPlacements(layout: FloorplanLayout): ExpectedRoom[] {
  const placed = layout.rooms.filter((room) => room.bbox != null);
  const flat = placedRoomsExtent(placed);
  if (!flat) return [];
  const out: ExpectedRoom[] = [];
  placed.forEach((room, index) => {
    const kind = room.kind ?? inferRoomKind(room.name);
    const expected = CLASS_OF[kind];
    if (!expected) return;
    const b = room.bbox!;
    // A sliver cannot be judged from a still; the auditor would only guess.
    if (b.w / flat.w < 0.06 || b.h / flat.h < 0.04) return;
    out.push({
      id: `r${index + 1}`,
      name: room.name,
      expected,
      box: {
        x: (b.x - flat.x) / flat.w,
        y: (b.y - flat.y) / flat.h,
        w: b.w / flat.w,
        h: b.h / flat.h,
      },
    });
  });
  return out;
}

function pct(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 100);
}

function where(box: ExpectedRoom["box"]): string {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const updown = cy < 0.34 ? "upper" : cy > 0.66 ? "lower" : "middle";
  const leftright = cx < 0.34 ? "left" : cx > 0.66 ? "right" : "centre";
  return `${updown} ${leftright}`;
}

/** What the plan says should be inside a region, in the still's own terms. */
const MARKER: Record<PlacementClass, string> = {
  sleeping: "a bed",
  day: "a sofa, a dining table or kitchen counters",
  wet: "a toilet, a basin or a bath",
  outdoor: "outdoor paving or a railing",
};

export function placementPrompt(rooms: ExpectedRoom[]): string {
  const rows = rooms
    .map(
      (room) =>
        `- ${room.id}: the region from ${pct(room.box.x)}% to ${pct(room.box.x + room.box.w)}% across and ${pct(room.box.y)}% to ${pct(room.box.y + room.box.h)}% down. Is ${MARKER[room.expected]} visible anywhere inside it?`,
    )
    .join("\n");
  return `The image is a bird's-eye cutaway of one apartment. Consider only the apartment itself: its outer walls are the frame of reference — 0% is its left (or top) outer wall and 100% its right (or bottom) outer wall. Ignore any margin and any caption bar.

For each region below, answer two questions.

"found": what occupies the MIDDLE of that region, judged by the furniture and fixtures you can see: beds mean bedroom; sofas or a dining table mean living or dining; counters with a hob or sink mean kitchen; a toilet, basin or bath mean bathroom; a washing machine alone means laundry; outdoor paving or a railing means balcony; an entry door with nothing else means entrance.

"has": true if the thing that region's own question names is visible ANYWHERE inside it — even partly, even at its edge — and false only if there is none of it in the region at all.

${rows}

Return JSON only: {"regions":[{"id":"r1","found":"<one of: ${FOUND.join(", ")}>","has":true}]}`;
}

export type PlacementMismatch = { room: ExpectedRoom; found: Found };

/**
 * A room has moved when the middle of its region shows something else AND
 * nothing of what belongs there is anywhere in that region.
 *
 * The middle alone is not enough. A still is a perspective cutaway with walls
 * of its own thickness, so the flat's proportions are never exactly the plan's
 * and a region's midpoint can land a few percent inside the neighbour. On
 * דירה 20 that produced three confident verdicts — bedroom shows living,
 * bedroom shows balcony, bath shows bedroom — against a still whose rooms were
 * every one of them where the plan puts them; a second look repeated all
 * three, because the error is geometric and not random. Asking as well whether
 * the bed is anywhere in the region keeps the verdict that matters (דירה 14's
 * kitchen painted over a bedroom, with no bed in that region at all) and drops
 * the ones that come from a few percent of drift.
 */
export function gradePlacement(rooms: ExpectedRoom[], answer: unknown): PlacementMismatch[] {
  const regions = ((answer as { regions?: unknown })?.regions ?? []) as Array<{
    id?: unknown;
    found?: unknown;
    has?: unknown;
  }>;
  const byId = new Map(regions.map((r) => [String(r.id ?? ""), r]));
  const out: PlacementMismatch[] = [];
  for (const room of rooms) {
    const row = byId.get(room.id);
    if (!row) continue;
    // Anything but a clear "no" leaves the room where the plan puts it.
    if (row.has !== false) continue;
    const raw = String(row.found ?? "unclear").toLowerCase();
    const found = (FOUND as readonly string[]).includes(raw) ? (raw as Found) : "unclear";
    // Only a clear answer of a different kind counts. "Unclear", a corridor
    // or storage is the auditor not knowing, and not knowing is not a verdict.
    const cls = FOUND_CLASS[found];
    if (!cls || found === "unclear") {
      // Two exceptions that are verdicts: laundry where a bedroom or the day
      // space should be, which is how the entrance of דירה 14 was lost.
      if (found === "laundry" && (room.expected === "sleeping" || room.expected === "day")) {
        out.push({ room, found });
      }
      continue;
    }
    if (cls !== room.expected) out.push({ room, found });
  }
  return out;
}

const EXPECTED_WORD: Record<PlacementClass, string> = {
  sleeping: "a bedroom",
  day: "the living/kitchen space",
  wet: "a bathroom",
  outdoor: "a balcony",
};

export function placementFailureText(mismatch: PlacementMismatch): string {
  return `room moved: the ${where(mismatch.room.box)} of the flat should be ${EXPECTED_WORD[mismatch.room.expected]}, the still shows ${mismatch.found}`;
}

/** One look. Null when no model answered; otherwise the rooms it says moved. */
async function askPlacement(
  still: { base64: string; mimeType: string },
  rooms: ExpectedRoom[],
): Promise<PlacementMismatch[] | null> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const genAI = new GoogleGenerativeAI(apiKey);
  const prompt = placementPrompt(rooms);
  for (const modelId of getFloorplanLayoutModelChain()) {
    try {
      recordAmbientFloorplanSpend("audit", "placement-audit");
      const model = genAI.getGenerativeModel({ model: modelId });
      const result = await model.generateContent({
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }, { inlineData: { data: still.base64, mimeType: still.mimeType } }],
          },
        ],
        generationConfig: deterministicGenerationConfig({ responseMimeType: "application/json" }),
      });
      recordAiUsage(modelId, usageFromGemini(result));
      return gradePlacement(rooms, parseModelJsonText(result.response.text()));
    } catch (err: unknown) {
      if (isLikelyGeminiModelUnavailable(err)) continue;
      log.warn("placement audit failed; the still is graded without it", {
        error: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }
  return null;
}

/**
 * Where each room landed, asked twice.
 *
 * A moved room is a hard failure: it blocks the still and sends the loop back
 * for another frame. That makes a wrong verdict expensive, and a single look
 * does produce them — a measured box that runs a little tall reaches into the
 * living room, and the auditor, asked what is in the middle of it, answers
 * honestly. The second look asks again about those regions alone, and only a
 * room both looks call moved is reported. The extra call is a fraction of a
 * cent against the image it would otherwise throw away.
 *
 * Null when there is nothing to check or no model answered.
 */
export async function checkRoomPlacement(
  still: { base64: string; mimeType: string },
  layout: FloorplanLayout,
): Promise<string[] | null> {
  const rooms = expectedRoomPlacements(layout);
  if (rooms.length < 2) return null;
  const first = await askPlacement(still, rooms);
  if (first == null) return null;
  if (first.length === 0) return [];

  const again = await askPlacement(
    still,
    first.map((row) => row.room),
  );
  // No second answer is not a reason to drop a verdict we already have.
  if (again == null) return first.map(placementFailureText);
  const confirmed = new Set(again.map((row) => row.room.id));
  const kept = first.filter((row) => confirmed.has(row.room.id));
  if (kept.length < first.length) {
    log.info("placement verdicts the second look did not repeat", {
      dropped: first.filter((row) => !confirmed.has(row.room.id)).map(placementFailureText),
    });
  }
  return kept.map(placementFailureText);
}
