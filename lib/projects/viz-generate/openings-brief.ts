import { atOtherLevel, type FloorplanLayout } from "@/lib/projects/floorplan-layout";
import { placedRoomsExtent } from "@/lib/projects/floorplan-plan-guide";

/**
 * The sheet's measured openings, said out loud: how many of each kind, how
 * wide, and where in the frame.
 *
 * An opening is measured against the whole sheet; the still is cropped to the
 * flat. Restating it against the rooms' own extent is what makes "upper left"
 * mean upper left of the picture the model is holding.
 */
export function openingPlaces(layout: FloorplanLayout): string[] {
  // A gap onto a terrace at another level is a window, whatever the floor on
  // its far side made the measurement call it: דירה 20's living room glazing
  // under its +15.94 roof was measured as an open doorway, and the brief told
  // the model every doorway is a way through.
  const roofs = layout.rooms.filter((room) => room.bbox != null && atOtherLevel(room, layout));
  const onRoof = (box: { x: number; y: number; w: number; h: number }) =>
    roofs.some((room) => {
      const b = room.bbox!;
      const m = 0.01;
      return box.x < b.x + b.w + m && box.x + box.w > b.x - m && box.y < b.y + b.h + m && box.y + box.h > b.y - m;
    });
  const placed = layout.openings
    .filter((opening) => opening.box != null)
    .map((opening) => (opening.kind !== "window" && onRoof(opening.box!) ? { ...opening, kind: "window" as const } : opening));
  if (placed.length === 0) return [];
  const flat = placedRoomsExtent(layout.rooms.filter((room) => room.bbox != null));
  const side = (box: { x: number; y: number; w: number; h: number }) => {
    const rawX = box.x + box.w / 2;
    const rawY = box.y + box.h / 2;
    const cx = flat && flat.w > 0 ? (rawX - flat.x) / flat.w : rawX;
    const cy = flat && flat.h > 0 ? (rawY - flat.y) / flat.h : rawY;
    const updown = cy < 0.4 ? "upper" : cy > 0.6 ? "lower" : "middle";
    const leftright = cx < 0.4 ? "left" : cx > 0.6 ? "right" : "centre";
    return `${updown} ${leftright}`;
  };
  // A way through with no leaf drawn — a cased opening, or a terrace slider the
  // sheet draws as a gap — is still a way through, and the one most often
  // walled over: דירה 14's bedroom exit to its west terrace is two of these.
  const names = { window: "window", door: "door", opening: "open doorway" } as const;
  const say = (kind: keyof typeof names) => {
    const rows = placed.filter((opening) => opening.kind === kind);
    if (rows.length === 0) return null;
    const where = rows
      .slice(0, 12)
      .map((opening) => `${opening.widthM?.toFixed(2) ?? "?"} m at ${side(opening.box!)}`)
      .join("; ");
    return `${rows.length} ${names[kind]}${rows.length === 1 ? "" : "s"} (${where})`;
  };
  return [say("window"), say("door"), say("opening")].filter((line): line is string => line != null);
}

/**
 * For a still being generated: every way through the sheet draws stays open.
 *
 * Without it the model is left to read doors off a drawing, and a doorway it
 * does not read becomes wall — on דירה 14 a dresser stood where the middle
 * bedroom opens onto its terrace, in every attempt.
 */
export function openingGenerationBrief(
  layout: FloorplanLayout,
  measured?: { sinkBasins?: number },
): string {
  const lines = openingPlaces(layout);
  const openings =
    lines.length === 0
      ? ""
      : `
DOORS, DOORWAYS AND WINDOWS THE SHEET DRAWS, measured off the drawing and placed against the apartment in the frame: ${lines.join(", ")}. Every door and doorway in this list is a way through in the still — a door leaf, a glazed slider where it leads onto a terrace, or a clear opening. Never close one with wall, and never stand a bed, dresser, wardrobe, desk or sofa across it. Every window in this list stays a window: glass in the wall, never a door leaf and never an opening out onto empty air.
`;
  return openings + sinkBrief(measured?.sinkBasins);
}

/**
 * The kitchen sink as the drawing measures it.
 *
 * "A double-bowl sink is one fixture" kept the model from inventing a second
 * sink location, and it read the rule as "one bowl": דירה 20's still came back
 * with a single basin where the sheet draws two side by side, and so did
 * דירה 14's. The count is measured, so the model is told it.
 */
function sinkBrief(basins: number | undefined): string {
  if (basins == null || basins < 1) return "";
  if (basins === 1) return `
KITCHEN SINK: one single-bowl sink on the drawn counter.
`;
  return `
KITCHEN SINK: the drawing measures ${basins} sink basins side by side on the kitchen counter. Draw ${basins} separate bowls in that one counter — not a single bowl, and not a second sink anywhere else.
`;
}

/**
 * Kitchen sink basins on the measured plate. findKitchenFittings reads a
 * double-bowl sink as its basins, each a piece of its own.
 */
export function kitchenSinkBasins(furniture: Array<{ kind: string }>): number {
  return furniture.filter((piece) => piece.kind === "sink").length;
}
