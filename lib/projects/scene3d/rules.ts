import type { FloorplanVizAudience } from "@/lib/projects/floorplan-viz-styles";

/**
 * The rules a still must keep, as rules rather than as paragraphs of prompt.
 *
 * Every one of these is written down somewhere in floorplan-viz-styles.ts and
 * asked of the image model in words. Measured over five reference sheets, the
 * model broke one of them in five stills out of five: two with a screen, three
 * with a double bed, one with letters rendered into the image.
 *
 * Here they divide into three kinds, and only the middle kind needs code.
 *
 * TRUE BY CONSTRUCTION — nothing to enforce, no way to break it:
 *   no screens (the library has no television, monitor, laptop or media unit
 *   to build), no letters or digits (the renderer draws no glyphs — a mezuzah
 *   is a case, not a word), no people and no figurative art, no room, wall,
 *   opening, fixture or terrace that was not measured, no internal stairs,
 *   and a terrace exactly the size the sheet printed.
 *
 * ENFORCED AS A RULE — this file:
 *   a drawn double rectangle rendered as one modest single; one sefarim
 *   cabinet, in the living room and nowhere else; a mezuzah on the posts of
 *   the doors that were measured.
 *
 * ANCHORED STAGING — staging.ts:
 *   every prop and every lamp rests on something the drawing draws.
 */

export type AudienceRules = {
  audience: FloorplanVizAudience;
  /** A bed is one 0.90 single, whatever rectangle the sheet draws. */
  singleBeds: boolean;
  /** A case on the posts of every measured door. No letters on it. */
  mezuzah: boolean;
  /** One flush cabinet of sefarim, in the living room only. */
  sefarimCabinet: boolean;
};

export function rulesFor(audience: FloorplanVizAudience | undefined): AudienceRules {
  const haredi = audience === "haredi";
  return {
    audience: haredi ? "haredi" : "general",
    singleBeds: haredi,
    mezuzah: haredi,
    sefarimCabinet: haredi,
  };
}

/**
 * Kinds of furniture that may never be built, whoever the audience is.
 *
 * The list is empty, and that is the point: there is no constructor for a
 * screen, so a still cannot contain one. The export exists so the test can
 * state the guarantee, and so that anyone adding a television to the library
 * has to come here and delete this comment first.
 */
export const FORBIDDEN_FURNITURE_KINDS: readonly string[] = [
  "screen",
  "tv",
  "television",
  "monitor",
  "laptop",
  "media",
];
