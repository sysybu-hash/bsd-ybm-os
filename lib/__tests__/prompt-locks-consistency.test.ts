/**
 * @jest-environment node
 *
 * One rule, said one way. Until 17/10/2026 the sales-brochure prompt told the
 * model to keep the entrance triangle (GEOMETRY_LOCK, ENTRANCE_LOCK) and, in
 * the same text, to omit it (PRESENTATION_LOCK, PIXEL_LOCK, ONE_FRAME).
 */
import {
  GEOMETRY_PIXEL_LOCK,
  GEOMETRY_PRESENTATION_LOCK,
  PIXEL_LOCK,
  PRESENTATION_LOCK,
} from "@/lib/projects/floorplan-viz-lock";
import { ENTRANCE_LOCK, GEOMETRY_LOCK, ONE_FRAME, buildVizPrompt } from "@/lib/projects/viz-generate/prompts";
import { FLOORPLAN_VIZ_PRESETS, PLAN_TRACE_LOCK } from "@/lib/projects/floorplan-viz-styles";
import { GOLDEN_HOUR_TEXT } from "@/lib/projects/building/house-photoreal";
import type { FloorplanLayout } from "@/lib/projects/floorplan-layout";

const sentences = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/** A sentence that forbids the entrance triangle without saying it stays outside the door. */
function forbidsEntranceTriangle(text: string): string[] {
  return sentences(text).filter(
    (s) => /entrance (triangle|arrow)/i.test(s) && /\b(forbidden|omit|drop|do not copy|do not 3d-print)\b/i.test(s) && !/\b(outside|except|only mark|stays)\b/i.test(s),
  );
}

describe("the entrance triangle", () => {
  const locks: Record<string, string> = { PIXEL_LOCK, GEOMETRY_PIXEL_LOCK, GEOMETRY_PRESENTATION_LOCK, PRESENTATION_LOCK, PLAN_TRACE_LOCK, GEOMETRY_LOCK, ENTRANCE_LOCK, ONE_FRAME };

  it.each(Object.entries(locks))("%s never forbids it without the front door's exception", (_name, text) => {
    expect(forbidsEntranceTriangle(text)).toEqual([]);
  });

  it("the whole sales prompt says one thing about it", () => {
    const layout = { rooms: [], openings: [], dimensionStrings: [], notes: [], unitLabel: "A", floor: "1" } as unknown as FloorplanLayout;
    const prompt = buildVizPrompt(layout, { kind: "overview" }, { styleKit: FLOORPLAN_VIZ_PRESETS.contemporary! });
    expect(forbidsEntranceTriangle(prompt)).toEqual([]);
    expect(prompt).toMatch(/entrance triangle|entrance arrow/i);
    expect(prompt).not.toMatch(/CAD arrows/);
  });
});

describe("golden hour", () => {
  it("lets the render's wall lights show and nothing else", () => {
    expect(GOLDEN_HOUR_TEXT).toMatch(/slim dark up-and-down wall light/);
    expect(GOLDEN_HOUR_TEXT).not.toMatch(/no visible fittings\b(?!.*other)/);
  });
});
